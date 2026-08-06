import { NextResponse } from "next/server";
import {
  DEFAULT_STAFF_PERMISSIONS,
  normalizePermissions,
  type AppPermissions,
} from "@/lib/permissions";
import {
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
  getServiceSupabase,
} from "@/lib/supabase/admin";
import { listProfiles, requireUserManager } from "@/lib/supabase/accountServer";

export async function GET(req: Request) {
  try {
    const gate = await requireUserManager(req.headers.get("authorization"));
    if (!gate.ok) { return NextResponse.json({ error: gate.error }, { status: gate.status }); }
    const users = await listProfiles();
    return NextResponse.json({ users });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireUserManager(req.headers.get("authorization"));
    if (!gate.ok) { return NextResponse.json({ error: gate.error }, { status: gate.status }); }

    const body = (await req.json()) as {
      username?: string;
      password?: string;
      displayName?: string;
      permissions?: AppPermissions;
      isSuperadmin?: boolean;
    };

    const username = normalizeUsername(body.username ?? "");
    const password = body.password ?? "";
    const displayName = (body.displayName ?? "").trim() || username;

    if (!isValidUsername(username)) {
      return NextResponse.json(
        {
          error:
            "Username must be 2–32 chars: start with a letter/number; use a-z, 0-9, . _ -",
        },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    // Only existing superadmins can create another superadmin
    const makeSuper = Boolean(body.isSuperadmin) && gate.profile.is_superadmin;
    const permissions = makeSuper
      ? undefined
      : normalizePermissions(body.permissions ?? DEFAULT_STAFF_PERMISSIONS);

    const admin = getServiceSupabase();
    const email = usernameToAuthEmail(username);

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
      });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Could not create auth user" },
        { status: 400 },
      );
    }

    const { data: profile, error: profileErr } = await admin
      .from("app_profiles")
      .insert({
        id: created.user.id,
        username,
        display_name: displayName,
        is_superadmin: makeSuper,
        is_active: true,
        last_assigned_password: password,
        prior_assigned_password: null,
        permissions: makeSuper
          ? {
              views: {
                scanner: true,
                summary: true,
                analytics: true,
                admin: true,
              },
              scanner: { gate: true, class: true, event: true, library: true },
              summary: {
                general: true,
                class: true,
                event: true,
                library: true,
                export: true,
                statusOverride: true,
              },
              analytics: {
                gate: true,
                class: true,
                event: true,
                library: true,
                export: true,
              },
              admin: {
                settings: true,
                events: true,
                classes: true,
                roster: true,
                ids: true,
                users: true,
                factoryReset: true,
                rosterImport: true,
                rosterRegister: true,
                rosterDemo: true,
                rosterPhotos: true,
              },
            }
          : permissions,
        created_by: gate.user.id,
      })
      .select("*")
      .single();

    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        { error: profileErr.message },
        { status: 400 },
      );
    }

    return NextResponse.json({ user: profile }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
