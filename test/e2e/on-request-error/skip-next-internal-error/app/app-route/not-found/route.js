import { notFound } from 'next/navigation'

export function GET() {
  notFound()
}

export const dynamic = 'force-dynamic'
