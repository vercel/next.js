import Link from 'next/link'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness((mod) => mod.markAsHydrated())

  return (
    <Link href="/not-found" data-test-link>
      Not found
    </Link>
  )
}
