import { draftMode } from 'next/headers'

export async function GET(request: Request) {
  ;(await draftMode()).disable()
  return new Response('Draft mode is disabled')
}
