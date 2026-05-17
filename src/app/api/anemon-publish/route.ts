import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";

const STORE = "/tmp/anemon_status.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = process.env.ANEMON_PUBLISH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "publish token not configured on server" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: string;
  try {
    body = await req.text();
    JSON.parse(body); // validate
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const stored = JSON.stringify({ received_at: Date.now(), payload: JSON.parse(body) });
  await fs.writeFile(STORE, stored, "utf-8");
  return NextResponse.json({ ok: true, bytes: stored.length });
}
