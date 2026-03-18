import { connection } from 'next/server'

export default async function Page() {
  await connection()
  throw new Error('server-page-edge-error')
}

export const runtime = 'edge'
