/**
 * One conceptual shutdown budget shared by the WebSocket transport, the
 * pending-upgrade tracker, the connection registry, and the outer HTTP
 * server close.
 *
 * Ordering matters:
 *   1. In-flight upgrade admission drains first (UPGRADE_HANDLER_CLOSE_GRACE
 *      _PERIOD_MS) so every admitted route hands its connection to the
 *      registry or completes.
 *   2. Accepted peers then receive a close frame (CLOSE_GRACE_PERIOD_MS) and,
 *      if they ignore it, are terminated with a short post-close buffer
 *      (TERMINATE_CLOSE_EVENT_GRACE_PERIOD_MS).
 *   3. The HTTP server itself is awaited only after all WebSocket phases, so
 *      HTTP_SERVER_CLOSE_GRACE_PERIOD_MS is the last backstop for arbitrary
 *      in-flight requests that would otherwise keep process exit open.
 *
 * Keep these in one place: tuning any stage without the ordering relationship
 * in view (e.g. making the terminate grace outlive ws's own close timer)
 * silently breaks the drain contract.
 */

/** Time ws waits for a peer's close frame before destroying the socket. */
export const WS_CLOSE_TIMEOUT_MS = 5_000

/** Time the pending-upgrade tracker waits for admitted upgrades to settle. */
export const UPGRADE_HANDLER_CLOSE_GRACE_PERIOD_MS = 5_000

/** Time accepted peers get to answer close frames before termination. */
export const CLOSE_GRACE_PERIOD_MS = 5_000

/** Additional time after terminate() to retain close-event bookkeeping. */
export const TERMINATE_CLOSE_EVENT_GRACE_PERIOD_MS = 1_000

/**
 * Last backstop: how long shutdown waits for ordinary in-flight HTTP
 * requests before destroying their connections.
 */
export const HTTP_SERVER_CLOSE_GRACE_PERIOD_MS = 5_000

/**
 * How long custom-server close() waits for an in-flight prepare() before
 * proceeding without its init stage. Dev compiles can take minutes; close is
 * best-effort and must return.
 */
export const PREPARE_CLOSE_GRACE_PERIOD_MS = 10_000
