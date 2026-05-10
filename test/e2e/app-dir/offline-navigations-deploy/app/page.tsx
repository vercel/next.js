import Link from 'next/link'
import { OfflineStatus } from './offline-status'

export default function Page() {
  return (
    <>
      <p id="offline-navigations-page">offline navigations deploy page</p>
      <Link id="viewport-prefetch-offline-navigation" href="/viewport-prefetch">
        Viewport prefetch offline navigation
      </Link>
      <OfflineStatus />
    </>
  )
}
