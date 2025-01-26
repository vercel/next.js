import { draftMode } from 'next/headers'

export async function GET() {
  ;(await draftMode()).enable('test-context')
  return new Response(
    "Enabled in Route Handler using `(await draftMode()).enable('test-context')`, check cookies"
  )
}
