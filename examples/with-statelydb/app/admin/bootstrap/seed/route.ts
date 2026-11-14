import { bootstrapData } from "@/lib/bootstrapData";

export async function POST() {
  await bootstrapData();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
