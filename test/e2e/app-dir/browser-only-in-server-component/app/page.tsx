import { browserOnly } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Page() {
  browserOnly()
  return <p>dynamic Server Component import should fail during compilation</p>
}
