import Link from 'next/link'
import '@/styles/b.css'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function B() {
  useTestHarness((harness) => harness.markAsHydrated())

  return (
    <>
      <Link className="a" href="/a">
        A
      </Link>
    </>
  )
}
