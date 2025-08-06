import { draftMode } from 'next/headers'

export async function GET(request: Request) {
  const isEnabled = (await draftMode()).isEnabled
  if (isEnabled) {
    ;(await draftMode()).disable()
    return new Response('Draft mode is disabled')
  } else {
    ;(await draftMode()).enable()
    return new Response('Draft mode is enabled')
  }
}
