import { cookies } from 'next/headers'

export async function GET() {
  await cookies()

  return Response.json({
    finished: Boolean((globalThis as any).instrumentationFinished),
  })
}
