import { NextResponse } from "next/server";
import fs from "node:fs/promises";

const STORE = "/tmp/anemon_status.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const raw = await fs.readFile(STORE, "utf-8");
    const { received_at, payload } = JSON.parse(raw);
    const ageSec = Math.round((Date.now() - received_at) / 1000);
    return NextResponse.json({ ...payload, _publisher_age_sec: ageSec }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "no data yet — publisher not running" }, { status: 503 });
  }
}
