import { connection } from 'next/server'

export async function GET() {
  // Request-time only, so a build never prerenders this route and exits.
  await connection()
  // Write to the stream and exit at once: output still in flight when the
  // server dies must reach the terminal.
  process.stderr.write(`${'x'.repeat(200 * 1024)}\n`)
  process.stderr.write('UPGRADE_TERMINAL_CRASH_END\n')
  process.exit(1)
}
