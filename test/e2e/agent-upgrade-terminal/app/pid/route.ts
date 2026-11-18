import { connection } from 'next/server'

export async function GET() {
  // Request-time only: each dev server process answers with its own pid, so
  // the test can tell when dev has restarted.
  await connection()
  return new Response(String(process.pid))
}
