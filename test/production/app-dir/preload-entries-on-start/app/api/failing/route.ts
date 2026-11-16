import { connection } from 'next/server'

// The test sets this only after building, so build-time evaluation succeeds.
await Promise.resolve()
if (process.env.PRELOAD_TEST_REJECT_USERLAND === '1') {
  console.log('preload-test:failure-attempted')
  throw new Error('preload-test:async-initialization-failed')
}

export async function GET() {
  await connection()
  return Response.json({ ok: true })
}
