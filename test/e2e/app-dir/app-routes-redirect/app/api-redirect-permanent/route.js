import { permanentRedirect } from 'next/navigation'

export function GET(request) {
  permanentRedirect('/redirect-target?success=true')
}

export function POST(request) {
  permanentRedirect('/redirect-target?success=true')
}
