import { NextResponse } from "next/server";
import {
  getServiceSupabase,
  isValidUsername,
  normalizeUsername,
} from "@/lib/supabase/admin";

/** Public: queue a forgotten-password request for admins (no email). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; note?: string };
    const username = normalizeUsername(body.username ?? "");
    const note = (body.note ?? "").trim().slice(0, 500);

    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: "Enter a valid username" },
        { status: 400 },
      );
    }

    const admin = getServiceSupabase();

    // Soft-check account exists (don't reveal too much — still ok for small org)
    const { data: profile } = await admin
      .from("app_profiles")
      .select("id, username")
      .ilike("username", username)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json(
        { error: "No account found for that username" },
        { status: 404 },
      );
    }

    // Avoid duplicate pending spam
    const { data: existing } = await admin
      .from("password_reset_requests")
      .select("id")
      .eq("status", "pending")
      .ilike("username", username)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        ok: true,
        message:
          "A reset request is already pending. An admin will assign a new password.",
      });
    }

    const { error } = await admin.from("password_reset_requests").insert({
      username: profile.username,
      note,
      status: "pending",
      target_user_id: profile.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message:
        "Request sent. An admin will review it and assign a new password.",
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not submit reset request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
