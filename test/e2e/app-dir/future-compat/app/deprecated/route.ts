import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { connection } from 'next/server'

const execFileAsync = promisify(execFile)

export async function GET() {
  await connection()
  const { stdout } = await execFileAsync(process.execPath, [
    '--eval',
    'process.stdout.write(Buffer("future-compat").toString())',
  ])
  return new Response(stdout)
}
