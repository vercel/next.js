import { draftMode } from 'next/headers'

export async function GET() {
  ;(await draftMode()).enable()
  return new Response(
    'Enabled in Route Handler with draftMode().enable(), check cookies'
  )
}
