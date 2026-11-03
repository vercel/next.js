import { connection } from 'next/server'

export async function GET() {
  // Request-time only: the error's code frame shows a source line wider than
  // the terminal, so the frame is cut to the terminal width.
  await connection()
  const error = new Error(
    `UPGRADE_TERMINAL_WIDTH is logged from a source line that is wider than the terminal`
  )
  console.error(error)
  return new Response('ok')
}
