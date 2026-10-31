import { execFile } from 'node:child_process'
import { connection } from 'next/server'

export async function GET() {
  await connection()
  // Node throws deprecations asynchronously, outside the route handler's promise.
  // A child process makes the failure observable without Next.js handling it as
  // an uncaught exception and allowing the request to succeed.
  return new Promise<Response>((resolve) => {
    execFile(
      process.execPath,
      ['--eval', 'process.stdout.write(Buffer("future-compat").toString())'],
      (error, stdout, stderr) => {
        resolve(
          new Response(error ? stderr : stdout, { status: error ? 500 : 200 })
        )
      }
    )
  })
}
