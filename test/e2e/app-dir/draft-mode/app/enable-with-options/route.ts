import { draftMode } from 'next/headers'

export async function GET() {
  ;(await draftMode()).enable({ sameSite: 'none', secure: true })
  return new Response(
    'Enabled in Route Handler using `(await draftMode()).enable({ sameSite: "none", secure: true })`, check cookies'
  )
}
