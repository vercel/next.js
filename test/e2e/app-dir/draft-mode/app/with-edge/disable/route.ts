import { draftMode } from 'next/headers'

export async function GET() {
  ;(await draftMode()).disable()
  return new Response(
    'Disabled in Route Handler using `(await draftMode()).enable()`, check cookies'
  )
}
