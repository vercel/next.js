import { draftMode } from 'next/headers'

export function GET() {
  draftMode().enable()
  return new Response(
    'Enabled in Route Handler using draftMode().enable(), check cookies'
  )
}
