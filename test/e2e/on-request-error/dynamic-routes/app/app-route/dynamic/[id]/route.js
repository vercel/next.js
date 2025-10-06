import { connection } from 'next/server'

export async function GET() {
  await connection()
  throw new Error('server-dynamic-route-node-error')
}
