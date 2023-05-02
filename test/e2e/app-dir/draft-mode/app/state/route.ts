import { draftMode } from 'next/headers'

export function GET() {
  const { enabled } = draftMode()
  return new Response(enabled ? 'ENABLED' : 'DISABLED')
}
