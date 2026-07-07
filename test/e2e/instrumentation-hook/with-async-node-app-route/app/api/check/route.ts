import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  console.log(cookieStore)

  return new Response(
    'API Node instrumentationFinished=' +
      (globalThis as any).instrumentationFinished
  )
}
