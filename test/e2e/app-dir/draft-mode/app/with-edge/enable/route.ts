import { draftMode } from 'next/headers'

export async function GET() {
  ;(await draftMode()).enable()
  return new Response(
    'Enabled in Route Handler using `(await draftMode()).enable()`, check cookies'
  )
}
