import { connection } from 'next/server'

export async function GET() {
  await connection()
  const deprecation = await require('pending-deprecation-fixture')
  return Response.json({ deprecation })
}
