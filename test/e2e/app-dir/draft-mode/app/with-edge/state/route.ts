import { draftMode } from 'next/headers'

export const runtime = 'edge'

export function GET() {
  const { isEnabled } = draftMode()
  return new Response(isEnabled ? 'ENABLED' : 'DISABLED')
}
