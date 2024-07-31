import { forbidden } from 'next/navigation'

export function GET() {
  forbidden()
}

export const dynamic = 'force-dynamic'
