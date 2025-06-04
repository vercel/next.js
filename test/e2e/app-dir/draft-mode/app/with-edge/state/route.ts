import { draftMode } from 'next/headers'

export async function GET() {
  const { isEnabled } = await draftMode()
  return new Response(isEnabled ? 'ENABLED' : 'DISABLED')
}
