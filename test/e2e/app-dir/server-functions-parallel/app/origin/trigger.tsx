'use client'

import { useRouter } from 'next/navigation'
import { slowRevalidate, slowRedirect } from '../actions'

export function RaceTrigger() {
  const router = useRouter()

  const onRevalidateRace = () => {
    // Start the slow action without awaiting, then navigate away. Its fetch is
    // still in flight, so the navigation lands first and the action ends up
    // trying to commit on /destination. Flag on `window` (survives the SPA nav)
    // when it resolves, so the test can prove the stale path actually ran, not
    // just that nothing changed. No `.catch`: this action should resolve, so a
    // rejection should fail the test.
    slowRevalidate().then(() => {
      ;(window as any).__raceActionSettled = true
    })
    router.push('/destination')
  }

  const onRedirectRace = () => {
    // Same race, but the action redirects. /destination lands first, so the late
    // redirect is stale and gets dropped: we stay on /destination instead of
    // going to /mutations. A redirect rejects its caller, so we catch it and flag
    // on `window` (survives the SPA nav) that it ran, proving the drop path
    // executed.
    slowRedirect('/mutations').catch(() => {
      ;(window as any).__redirectRaceSettled = true
    })
    router.push('/destination')
  }

  const onExternalRedirectRace = () => {
    // Same as onRedirectRace, but to another site, which would normally force a
    // full-page jump away from the app. /destination lands first, so the late
    // external redirect is stale and dropped instead of jumping away: we stay on
    // /destination. We catch the redirect rejection and flag on `window`
    // (survives the SPA nav) that it ran, proving the drop path executed.
    slowRedirect(
      'https://next-data-api-endpoint.vercel.app/api/random?page'
    ).catch(() => {
      ;(window as any).__externalRedirectRaceSettled = true
    })
    router.push('/destination')
  }

  return (
    <>
      <button data-testid="fire-race" onClick={onRevalidateRace}>
        go
      </button>
      <button data-testid="fire-redirect-race" onClick={onRedirectRace}>
        redirect-race
      </button>
      <button
        data-testid="fire-external-redirect-race"
        onClick={onExternalRedirectRace}
      >
        external-redirect-race
      </button>
    </>
  )
}
