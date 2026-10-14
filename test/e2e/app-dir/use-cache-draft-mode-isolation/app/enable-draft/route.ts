import { draftMode } from 'next/headers'

export async function GET() {
  const draft = await draftMode()
  draft.enable()

  return new Response('draft mode enabled')
}
