import { NextRequest, NextResponse } from "next/server";
import { incrementPublicView } from "@/lib/public-stats";
import { rateLimit } from "@/lib/rate-limit";
import {
  isPublicViewKind,
  publicViewCookieName,
} from "@/lib/public-view";

const VIEW_COOLDOWN_SECONDS = 30 * 60;

export async function POST(request: NextRequest) {
  // Abuse guard that deliberately reads NOTHING about the requester (the
  // privacy guardrail test enforces this): instead of identifying clients,
  // cap how fast counters may move at all — per target and site-wide. A
  // cookie-clearing bot can then inflate a page by at most the cap, and the
  // DB write rate stays bounded no matter how hard anyone hammers this.
  if (
    !rateLimit("public-view:global", 600, 60_000) // total counted views/min
  ) {
    return NextResponse.json({ ok: true, counted: false });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const kind = record.kind;
  const targetId = record.targetId;
  if (!isPublicViewKind(kind) || typeof targetId !== "string" || !targetId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Per-target ceiling: no single page can gain views faster than this,
  // which is what makes count inflation boring.
  if (!rateLimit(`public-view:${kind}:${targetId}`, 30, 5 * 60_000)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  const cookieName = publicViewCookieName(kind, targetId);
  if (request.cookies.get(cookieName)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  const counted = await incrementPublicView(kind, targetId);
  const response = NextResponse.json({ ok: true, counted });
  if (counted) {
    response.cookies.set(cookieName, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VIEW_COOLDOWN_SECONDS,
    });
  }
  return response;
}
