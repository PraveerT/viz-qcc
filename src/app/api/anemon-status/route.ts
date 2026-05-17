import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API = process.env.ANEMON_API_URL
  ?? "https://providence-easily-assignment-guaranteed.trycloudflare.com";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const override = params.get("api");
  const base = (override ?? DEFAULT_API).replace(/\/+$/, "");

  try {
    const r = await fetch(`${base}/api/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `upstream HTTP ${r.status}`, base },
        { status: 502 }
      );
    }
    const body = await r.text();
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, base }, { status: 502 });
  }
}
