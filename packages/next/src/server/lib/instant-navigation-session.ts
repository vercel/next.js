/**
 * Returns the server's session ID for the Instant Navigation Testing API.
 *
 * The ID is stamped onto the `next-instant-navigation-testing` cookie so
 * the server can ignore cookies left behind by a previous server process
 * (for example, when a developer stops one `next dev` and starts another
 * on the same port — the stale cookie from the previous project shouldn't
 * confuse the new server).
 *
 * In development: a fresh UUID generated once per process (lazy-init).
 * In production with `exposeTestingApiInProductionBuild`: the build ID,
 * which already changes per build and is stable for the deployment.
 */

let devSessionId: string | null = null

export function getInstantNavigationSessionId(buildId: string): string {
  if (process.env.__NEXT_DEV_SERVER) {
    if (devSessionId === null) {
      devSessionId = crypto.randomUUID()
    }
    return devSessionId
  }
  return buildId
}
