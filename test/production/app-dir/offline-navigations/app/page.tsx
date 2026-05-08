import { cacheLife, cacheTag, updateTag } from 'next/cache'
import { OfflineStatus } from './offline-status'
import {
  DynamicPatternSourcePrefetchButton,
  DynamicPatternTargetPrefetchButton,
  PrefetchButton,
  RefreshButton,
} from './prefetch-button'

async function ActionInvalidationMarker() {
  'use cache'
  cacheLife('max')
  cacheTag('offline-navigation-action')

  return <p id="action-invalidation-marker">action invalidation marker</p>
}

async function invalidateOfflineNavigationAction() {
  'use server'
  updateTag('offline-navigation-action')
}

export default function Page() {
  return (
    <>
      <p>offline navigations page</p>
      <OfflineStatus />
      <ActionInvalidationMarker />
      <form action={invalidateOfflineNavigationAction}>
        <button id="invalidate-offline-navigation-action" type="submit">
          Invalidate offline navigation action
        </button>
      </form>
      <PrefetchButton />
      <DynamicPatternSourcePrefetchButton />
      <DynamicPatternTargetPrefetchButton />
      <RefreshButton />
    </>
  )
}
