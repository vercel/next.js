'use client'

import { useRouter } from 'next/navigation'
import { revalidateNoPrefetch, redirectToSomePage } from './actions'

export function TestControls() {
  const router = useRouter()
  return (
    <>
      <button id="push-hash" onClick={() => router.push('/#section')}>
        Push hash
      </button>
      <button
        id="push-end-marker-hash"
        onClick={() => router.push('/end-marker#section')}
      >
        Push end-marker hash
      </button>
      <button
        id="push-streaming-slow"
        onClick={() => router.push('/streaming-slow')}
      >
        Push streaming slow
      </button>
      <button
        id="shallow-tweak-streaming-slow"
        onClick={() => {
          // Shallow routing exactly as the docs recommend (app-owned null
          // state): fails the internal-state guard in the patched pushState,
          // so it dispatches the ACTION_RESTORE sync path.
          window.history.pushState(null, '', '/streaming-slow?tab=2')
        }}
      >
        Shallow tweak streaming slow
      </button>
      <button
        id="push-no-prefetch"
        onClick={() => {
          // A programmatic push with no <Link> in the viewport: nothing was
          // prefetched, so the router must fetch the route before it has
          // anything to render — a cache miss by definition.
          router.push('/no-prefetch')
        }}
      >
        Push without prefetch
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
      <button
        id="push-then-broken-nav"
        onClick={() => {
          // A navigation replaced (same tick) by one that then fails: with no
          // live navigation left in the race, the replaced one is dropped —
          // neither transition may report a terminal event.
          router.push('/some-page')
          router.push('/broken-nav')
        }}
      >
        Push then broken nav
      </button>
      <button
        id="push-then-revalidate-action"
        onClick={() => {
          // A server action revalidation queued behind an in-flight
          // navigation: the action re-derives the navigation's uncommitted
          // state at the same URL, so the navigation must still report its
          // commit.
          router.push('/no-prefetch')
          // Deliberately not .catch()'d: for un-awaited server actions the
          // router delivers redirects (and errors) through the rejected
          // action promise, via a window `unhandledrejection` listener in
          // app-router.tsx — attaching a catch marks the rejection handled
          // and silently disables that delivery.
          revalidateNoPrefetch()
        }}
      >
        Push then revalidate action
      </button>
      <button
        id="push-then-redirect-action"
        onClick={() => {
          // A server action redirect queued behind an in-flight navigation:
          // the redirect's destination is not what the navigation targeted,
          // so its commit must not be attributed to the pending transition.
          router.push('/dashboard')
          // Deliberately not .catch()'d — the redirect is delivered through
          // the rejected action promise (see above); a catch breaks it.
          redirectToSomePage()
        }}
      >
        Push then redirect action
      </button>
    </>
  )
}
