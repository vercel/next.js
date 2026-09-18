import { connection } from 'next/server'

export async function GET() {
  await connection()
  return Response.json({
    registered:
      Reflect.get(globalThis, '__H3_INSTRUMENTATION_REGISTERED') === true,
  })
}
