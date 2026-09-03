import Link from 'next/link'
import { RefreshButton } from './refresh-button'

export default function Page() {
  return (
    <div>
      <h1 id="page-title">Prefetch Refresh Lazy</h1>
      <Link href="/other-1" prefetch={false} id="link-1">
        Other 1
      </Link>
      <Link href="/other-2" prefetch={false} id="link-2">
        Other 2
      </Link>
      <RefreshButton />
      <div id="timestamp">{Date.now()}</div>
    </div>
  )
}
