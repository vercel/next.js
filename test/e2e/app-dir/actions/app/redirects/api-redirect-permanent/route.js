import { permanentRedirect } from 'next/navigation'

export function POST(request) {
  permanentRedirect('/redirects/?success=true')
}
