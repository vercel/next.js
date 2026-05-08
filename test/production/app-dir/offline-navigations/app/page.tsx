import {
  cacheLife,
  cacheTag,
  revalidatePath,
  revalidateTag,
  updateTag,
} from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
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

async function redirectAfterOfflineNavigationInvalidationAction() {
  'use server'
  updateTag('offline-navigation-action')
  redirect('/?offline-navigation-redirect=1')
}

async function revalidateOfflineNavigationPathAction() {
  'use server'
  revalidatePath('/prefetched')
}

async function revalidateOfflineNavigationTagAction() {
  'use server'
  revalidateTag('offline-navigation-action', { expire: 0 })
}

async function mutateOfflineNavigationCookieAction() {
  'use server'
  const cookieStore = await cookies()
  cookieStore.set('offline-navigation-cookie-mutation', `${Date.now()}`, {
    path: '/',
    sameSite: 'lax',
  })
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
      <form action={redirectAfterOfflineNavigationInvalidationAction}>
        <button
          id="redirect-after-offline-navigation-invalidation"
          type="submit"
        >
          Redirect after offline navigation invalidation
        </button>
      </form>
      <form action={revalidateOfflineNavigationPathAction}>
        <button id="revalidate-offline-navigation-path" type="submit">
          Revalidate offline navigation path
        </button>
      </form>
      <form action={revalidateOfflineNavigationTagAction}>
        <button id="revalidate-offline-navigation-tag" type="submit">
          Revalidate offline navigation tag
        </button>
      </form>
      <form action={mutateOfflineNavigationCookieAction}>
        <button id="mutate-offline-navigation-cookie" type="submit">
          Mutate offline navigation cookie
        </button>
      </form>
      <PrefetchButton />
      <DynamicPatternSourcePrefetchButton />
      <DynamicPatternTargetPrefetchButton />
      <RefreshButton />
    </>
  )
}
