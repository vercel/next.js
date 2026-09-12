import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.HTL_SECRET ?? "";

function b64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifyXTrust(token: string): Promise<number | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payloadB64, sigB64] = parts;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sigB64), new TextEncoder().encode(payloadB64));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    const now = Math.floor(Date.now() / 1000);
    if (payload.score < 0 || payload.score > 1) return null;
    if (now > payload.exp || now - payload.iat > 120) return null;
    return payload.score;
  } catch { return null; }
}

export async function middleware(req: NextRequest) {
  const token = req.headers.get("x-trust") ?? "";
  const score = token ? await verifyXTrust(token) : null;
  const res = NextResponse.next();
  res.headers.set("x-trust-score", score?.toString() ?? "0");
  res.headers.set("x-trust-annotated", "true");
  return res;
}

export const config = { matcher: "/api/:path*" };
