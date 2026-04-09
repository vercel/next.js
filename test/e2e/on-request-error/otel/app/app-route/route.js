import { connection } from 'next/server'

export async function GET() {
  await connection()
  throw new Error('route-node-error')
}
