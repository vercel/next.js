import Link from 'next/link'
import { RetainedActionButton } from './retained-action-button'

export default function Page() {
  return (
    <main id="home">
      Home
      <Link href="/overlap/unlisted" id="to-overlap-unlisted">
        Overlap unlisted
      </Link>
      <RetainedActionButton />
    </main>
  )
}
