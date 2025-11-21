import { connection } from 'next/server'

export async function GET() {
  await connection()
  throw new Error('route-edge-error')
}

export const runtime = 'edge'
