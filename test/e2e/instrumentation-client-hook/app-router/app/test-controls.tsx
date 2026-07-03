'use client'

import { useRouter } from 'next/navigation'

export function TestControls() {
  const router = useRouter()
  return (
    <>
      <button id="push-no-prefetch" onClick={() => router.push('/no-prefetch')}>
        Push no-prefetch
      </button>
      <button
        id="abort-double-push"
        onClick={() => {
          // Two navigations in one tick: the second replaces the first, so the
          // first should be reported as aborted when the second commits.
          router.push('/some-page')
          router.push('/dashboard')
        }}
      >
        Abort double push
      </button>
      <button id="push-hash" onClick={() => router.push('/#section')}>
        Push hash
      </button>
      <button
        id="triple-push"
        onClick={() => {
          // Three navigations in one tick: only the newest one may commit; both
          // older ones must be reported as aborted, replaced by that commit.
          router.push('/some-page')
          router.push('/blog/hello')
          router.push('/dashboard')
        }}
      >
        Triple push
      </button>
      <button
        id="push-then-refresh"
        onClick={() => {
          // A refresh queued behind an in-flight navigation. The refresh's
          // state update is not a tracked transition, so it must not emit any
          // lifecycle events, and it must not steal or abort the pending
          // navigation's commit.
          router.push('/no-prefetch')
          router.refresh()
        }}
      >
        Push then refresh
      </button>
      <button
        id="push-then-back"
        onClick={() => {
          // A push raced by a history traversal (popstate is dispatched
          // asynchronously by the browser).
          router.push('/blog/hello')
          window.history.back()
        }}
      >
        Push then back
      </button>
      <button
        id="double-same-page-push"
        onClick={() => {
          // Two pushes to the URL we are already on: they must be tracked as
          // two distinct transitions (with fresh destination trees), so the
          // newer one commits and the older one aborts.
          router.push('/')
          router.push('/')
        }}
      >
        Double same-page push
      </button>
      <button
        id="replace-some-page"
        onClick={() => router.replace('/some-page')}
      >
        Replace some page
      </button>
      <button
        id="push-catch-all"
        onClick={() => router.push('/docs/a/b?x=1&x=2')}
      >
        Push catch-all
      </button>
      <button id="push-missing" onClick={() => router.push('/no-such-route')}>
        Push missing
      </button>
    </>
  )
}
