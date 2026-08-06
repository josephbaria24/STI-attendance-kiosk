import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireUserManager } from "@/lib/supabase/accountServer";

export async function GET(req: Request) {
  try {
    const gate = await requireUserManager(req.headers.get("authorization"));
    if (!gate.ok) { return NextResponse.json({ error: gate.error }, { status: gate.status }); }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";

    const admin = getServiceSupabase();
    let query = admin
      .from("password_reset_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(100);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
