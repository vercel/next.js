import Link from 'next/link'
import PushButton from '../PushButton'
import PushButtonNoStore from '../PushButtonNoStore'

export default function Navigation() {
  return (
    <div>
      <p>
        <Link href="/private/by-link" id="to-private-by-link">
          to /private/by-link
        </Link>
      </p>
      <p>
        <Link
          href="/private/by-link-without-prefetch"
          id="to-private-by-link-without-prefetch"
          prefetch={false}
        >
          to /private/by-link-without-prefetch
        </Link>
      </p>
      <PushButton />
      <p>
        <Link
          href="/private/by-link"
          id="to-private-by-link-no-store"
          unstable_noStoreTransition
          prefetch={false}
        >
          to /private/by-link with no-store-transition
        </Link>
      </p>
      <PushButtonNoStore />
      <p>
        <Link href="/open-private" id="open-private">
          to /open-private
        </Link>
      </p>
      <p>
        <Link href="/hide-private" id="hide-private">
          to /hide-private
        </Link>
      </p>
    </div>
  )
}
