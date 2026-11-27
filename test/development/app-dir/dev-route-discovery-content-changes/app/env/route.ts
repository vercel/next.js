import { connection } from 'next/server'

export async function GET() {
  await connection()
  return Response.json({ value: process.env.ROUTE_DISCOVERY_VALUE ?? null })
}
