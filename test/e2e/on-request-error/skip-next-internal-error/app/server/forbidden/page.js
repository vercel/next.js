import { forbidden } from 'next/navigation'

export default function Page() {
  forbidden()
}

export const dynamic = 'force-dynamic'
