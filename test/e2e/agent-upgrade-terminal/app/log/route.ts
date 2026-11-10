import { connection } from 'next/server'

export async function GET(request: Request) {
  // Request-time only: the log marks a request served while the menu is open.
  await connection()
  const n = new URL(request.url).searchParams.get('n')
  console.log(`UPGRADE_TERMINAL_LOG ${n}`)
  return new Response('ok')
}
