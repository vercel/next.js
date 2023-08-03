import { draftMode } from 'next/headers'

export function GET() {
  draftMode().disable()
  return new Response(
    'Disabled in Route Handler using draftMode().enable(), check cookies'
  )
}
