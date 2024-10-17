import { redirect } from 'next/navigation'

export function GET() {
  redirect('/another')
}

export const dynamic = 'force-dynamic'
