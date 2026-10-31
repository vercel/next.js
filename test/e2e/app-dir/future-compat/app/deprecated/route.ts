import { connection } from 'next/server'

export async function GET() {
  await connection()
  return Response.json({
    // Pick any deprecated API. Manually emitting a deprecation warning may also
    // work. Just make sure we can assert on the stack of a thrown deprecation.
    value: new Buffer('future-compat').toString(),
    throwDeprecation: process.throwDeprecation ?? false,
  })
}
