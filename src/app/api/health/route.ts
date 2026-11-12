import { connection, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Uptime check for monitoring (e.g. UptimeRobot, Better Stack). Public, no
 * secrets: reports whether the app can reach Supabase with the anon key.
 */
export async function GET() {
  await connection(); // always live, never prerendered or cached
  const started = Date.now();
  try {
    const { error } = await createPublicClient().from("cities").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json(
      { status: "ok", database: "ok", latency_ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
