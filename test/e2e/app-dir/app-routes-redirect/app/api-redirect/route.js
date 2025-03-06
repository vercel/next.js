import { redirect } from 'next/navigation'

export function GET(request) {
  redirect('/redirect-target?success=true')
}

export function POST(request) {
  redirect('/redirect-target?success=true')
}
