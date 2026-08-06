import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireUserManager } from "@/lib/supabase/accountServer";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const gate = await requireUserManager(req.headers.get("authorization"));
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { id } = await ctx.params;
    const body = (await req.json()) as {
      action?: "resolve" | "reject";
      newPassword?: string;
      adminNote?: string;
    };

    const action = body.action;
    if (action !== "resolve" && action !== "reject") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const admin = getServiceSupabase();
    const { data: row, error: fetchErr } = await admin
      .from("password_reset_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (row.status !== "pending") {
      return NextResponse.json(
        { error: "Request already handled" },
        { status: 400 },
      );
    }

    if (action === "reject") {
      const { error } = await admin
        .from("password_reset_requests")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
          resolved_by: gate.user.id,
          admin_note: (body.adminNote ?? "").trim(),
        })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    const newPassword = body.newPassword ?? "";
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 },
      );
    }

    // Find profile by username on the request
    const { data: profile } = await admin
      .from("app_profiles")
      .select("id, username, is_active, last_assigned_password, prior_assigned_password")
      .ilike("username", String(row.username))
      .maybeSingle();

    if (!profile) {
      return NextResponse.json(
        { error: `No account found for username "${row.username}"` },
        { status: 404 },
      );
    }

    const previousPassword =
      typeof profile.last_assigned_password === "string" &&
      profile.last_assigned_password.length > 0
        ? profile.last_assigned_password
        : null;

    const { error: pwErr } = await admin.auth.admin.updateUserById(
      profile.id,
      { password: newPassword },
    );
    if (pwErr) {
      return NextResponse.json({ error: pwErr.message }, { status: 400 });
    }

    // Ensure account is active after reset + shift password recall chain
    const { error: profileUpdErr } = await admin
      .from("app_profiles")
      .update({
        is_active: true,
        prior_assigned_password: previousPassword,
        last_assigned_password: newPassword,
      })
      .eq("id", profile.id);
    if (profileUpdErr) {
      return NextResponse.json(
        { error: profileUpdErr.message },
        { status: 400 },
      );
    }

    const { error: updErr } = await admin
      .from("password_reset_requests")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: gate.user.id,
        admin_note: (body.adminNote ?? "").trim(),
        target_user_id: profile.id,
        assigned_password: newPassword,
        previous_password: previousPassword,
      })
      .eq("id", id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: profile.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to handle request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
