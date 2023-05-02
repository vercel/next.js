import { draftMode } from 'next/headers'

export const runtime = 'edge'

export function GET() {
  const { enabled } = draftMode()
  return new Response(enabled ? 'ENABLED' : 'DISABLED')
}
