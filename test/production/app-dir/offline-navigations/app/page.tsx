import { OfflineStatus } from './offline-status'
import { PrefetchButton, RefreshButton } from './prefetch-button'

export default function Page() {
  return (
    <>
      <p>offline navigations page</p>
      <OfflineStatus />
      <PrefetchButton />
      <RefreshButton />
    </>
  )
}
