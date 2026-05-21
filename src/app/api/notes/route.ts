import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";

const STORE = "/tmp/anemon_notes.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Notes = { title?: string; body: string; updated_at: number };

export async function GET() {
  try {
    const raw = await fs.readFile(STORE, "utf-8");
    const notes = JSON.parse(raw) as Notes;
    return NextResponse.json(notes, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { title: "", body: "", updated_at: 0 } satisfies Notes,
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.ANEMON_PUBLISH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "publish token not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let parsed: Partial<Notes>;
  try {
    const text = await req.text();
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof parsed.body !== "string") {
    return NextResponse.json({ error: "body must be a string" }, { status: 400 });
  }
  const out: Notes = {
    title: typeof parsed.title === "string" ? parsed.title : "",
    body: parsed.body,
    updated_at: Date.now(),
  };
  await fs.writeFile(STORE, JSON.stringify(out), "utf-8");
  return NextResponse.json({ ok: true, bytes: out.body.length });
}
