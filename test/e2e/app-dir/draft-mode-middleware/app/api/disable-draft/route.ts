import { draftMode } from 'next/headers'

// BACKPORT: GETs are static by default in 14.x
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  draftMode().disable()
  return new Response('Draft mode is disabled')
}
