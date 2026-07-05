import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  console.log(cookieStore)

  return Response.json({
    finished: Boolean((globalThis as any).instrumentationFinished),
  })
}
