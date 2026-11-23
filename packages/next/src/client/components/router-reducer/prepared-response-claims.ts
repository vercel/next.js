/**
 * The responses a prepare phase (`router.experimental_prepare()`) is holding
 * while they stream. See `decodePreparedNavigationResponse` in
 * fetch-server-response.ts.
 */
export type PreparedResponseClaims = {
  // Settles each held response: with a decode started by the caller if it's
  // claimed for the commit, or with the response's own decode if it's
  // released.
  held: Set<(isClaimed: boolean) => void>
  // Set once the responses were claimed or released. Requests started after
  // that aren't held.
  isClosed: boolean
}

// Every PreparedResponseClaims that holds a response, across prepared
// navigations.
const claimsWithHeldResponses = new Set<PreparedResponseClaims>()

export function createPreparedResponseClaims(): PreparedResponseClaims {
  return { held: new Set(), isClosed: false }
}

export function holdPreparedResponse(
  claims: PreparedResponseClaims,
  settle: (isClaimed: boolean) => void
): void {
  claims.held.add(settle)
  claimsWithHeldResponses.add(claims)
}

/**
 * Stops holding a response, for example because its body ended. Returns false
 * if it was already claimed or released.
 */
export function unholdPreparedResponse(
  claims: PreparedResponseClaims,
  settle: (isClaimed: boolean) => void
): boolean {
  const wasHeld = claims.held.delete(settle)
  if (claims.held.size === 0) {
    claimsWithHeldResponses.delete(claims)
  }
  return wasHeld
}

/**
 * Settles every held prepared response. Called synchronously whenever a router
 * navigation starts, and when a navigation is prepared.
 *
 * The commit of a prepared navigation passes its own claims, whose responses
 * are decoded again from the calling task (the click that commits). Every
 * other held response is released to its own decode, so its data arrives as
 * it streams. Otherwise, a back/forward navigation or any other navigation
 * that reuses the BFCache entries an abandoned preparation wrote would wait
 * until that response ended. Both close the claims, so a response is settled
 * once, and later requests aren't held.
 */
export function settlePreparedResponses(
  committing: PreparedResponseClaims | null
): void {
  if (committing !== null) {
    committing.isClosed = true
  }
  for (const claims of Array.from(claimsWithHeldResponses)) {
    claimsWithHeldResponses.delete(claims)
    claims.isClosed = true
    const held = Array.from(claims.held)
    claims.held.clear()
    const isClaimed = claims === committing
    for (const settle of held) {
      settle(isClaimed)
    }
  }
}
