import { NextResponse } from "next/server";
import {
  normalizePermissions,
  type AppPermissions,
} from "@/lib/permissions";
import { getServiceSupabase, isValidUsername, normalizeUsername } from "@/lib/supabase/admin";
import { mapProfile, requireUserManager } from "@/lib/supabase/accountServer";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const gate = await requireUserManager(req.headers.get("authorization"));
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { id } = await ctx.params;
    const body = (await req.json()) as {
      displayName?: string;
      username?: string;
      isActive?: boolean;
      isSuperadmin?: boolean;
      permissions?: AppPermissions;
      password?: string;
    };

    const admin = getServiceSupabase();
    const { data: existing, error: fetchErr } = await admin
      .from("app_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const target = mapProfile(existing as Record<string, unknown>);

    // Non-superadmin cannot edit superadmins or grant superadmin / users perm escalation freely
    if (target.is_superadmin && !gate.profile.is_superadmin) {
      return NextResponse.json(
        { error: "Only a super admin can edit another super admin" },
        { status: 403 },
      );
    }

    if (id === gate.user.id && body.isActive === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account" },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {};

    if (typeof body.displayName === "string") {
      patch.display_name = body.displayName.trim() || target.username;
    }

    if (typeof body.username === "string") {
      const username = normalizeUsername(body.username);
      if (!isValidUsername(username)) {
        return NextResponse.json({ error: "Invalid username" }, { status: 400 });
      }
      patch.username = username;
    }

    if (typeof body.isActive === "boolean") {
      patch.is_active = body.isActive;
    }

    if (typeof body.isSuperadmin === "boolean") {
      if (!gate.profile.is_superadmin) {
        return NextResponse.json(
          { error: "Only a super admin can change super admin status" },
          { status: 403 },
        );
      }
      if (id === gate.user.id && body.isSuperadmin === false) {
        return NextResponse.json(
          { error: "You cannot remove your own super admin flag" },
          { status: 400 },
        );
      }
      patch.is_superadmin = body.isSuperadmin;
    }

    if (body.permissions) {
      if (target.is_superadmin || patch.is_superadmin === true) {
        // keep full access for superadmins
      } else {
        const next = normalizePermissions(body.permissions);
        if (!gate.profile.is_superadmin) {
          // Managers who aren't superadmin cannot grant users / factoryReset
          next.admin.users = false;
          next.admin.factoryReset = false;
        }
        patch.permissions = next;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await admin
        .from("app_profiles")
        .update(patch)
        .eq("id", id);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }
    }

    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 },
        );
      }
      const { data: pwProfile } = await admin
        .from("app_profiles")
        .select("last_assigned_password")
        .eq("id", id)
        .maybeSingle();
      const previous =
        typeof pwProfile?.last_assigned_password === "string" &&
        pwProfile.last_assigned_password.length > 0
          ? pwProfile.last_assigned_password
          : null;

      const { error: pwErr } = await admin.auth.admin.updateUserById(id, {
        password: body.password,
      });
      if (pwErr) {
        return NextResponse.json({ error: pwErr.message }, { status: 400 });
      }
      await admin
        .from("app_profiles")
        .update({
          prior_assigned_password: previous,
          last_assigned_password: body.password,
        })
        .eq("id", id);
    }

    const { data: refreshed } = await admin
      .from("app_profiles")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json({
      user: refreshed
        ? mapProfile(refreshed as Record<string, unknown>)
        : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const gate = await requireUserManager(req.headers.get("authorization"));
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { id } = await ctx.params;
    if (id === gate.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 },
      );
    }

    const admin = getServiceSupabase();
    const { data: existing } = await admin
      .from("app_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const target = mapProfile(existing as Record<string, unknown>);
    if (target.is_superadmin && !gate.profile.is_superadmin) {
      return NextResponse.json(
        { error: "Only a super admin can delete another super admin" },
        { status: 403 },
      );
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
