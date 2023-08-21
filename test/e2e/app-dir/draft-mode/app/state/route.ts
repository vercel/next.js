import { draftMode } from 'next/headers'

export function GET() {
  const { isEnabled } = draftMode()
  return new Response(isEnabled ? 'ENABLED' : 'DISABLED')
}
