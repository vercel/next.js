import { OfflineStatus } from './offline-status'
import { PrefetchButton } from './prefetch-button'

export default function Page() {
  return (
    <>
      <p>offline navigations page</p>
      <OfflineStatus />
      <PrefetchButton />
    </>
  )
}
