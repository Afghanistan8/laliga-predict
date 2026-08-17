// Same-origin JSON-RPC proxy to the Bradbury RPC.
//
// wagmi polls in the background and genlayer-js issues reads/writes; routing
// both through this same-origin endpoint sidesteps any CORS handling on the
// public RPC. Mirrors the DEX aggregator's /api/rpc route.

import { NextRequest, NextResponse } from "next/server";
import { BRADBURY } from "@/lib/config";

const RPC_URL = process.env.GENLAYER_RPC_URL || BRADBURY.rpcUrl;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const upstream = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "RPC proxy failed" },
      { status: 502 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, upstream: RPC_URL });
}
