import { connection } from 'next/server'

export async function GET() {
  await connection()
  return Response.json({
    value: new Buffer('future-compat').toString(),
    throwDeprecation: process.throwDeprecation ?? false,
  })
}
