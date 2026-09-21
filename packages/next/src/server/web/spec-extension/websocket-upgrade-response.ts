const WEBSOCKET_UPGRADE = Symbol.for('next.internal.websocket-upgrade-response')

/**
 * The dependency-free shape shared by the raw HTTP policy and Node transport.
 * Public hook types and the response factory are layered on top separately.
 *
 * @internal
 */
export interface WebSocketUpgradeMetadata {
  readonly hooks: Readonly<{
    readonly open?: unknown
    readonly message?: unknown
    readonly close?: unknown
    readonly error?: unknown
  }>
  readonly protocol?: string
}

/** @internal */
export function setWebSocketUpgradeMetadata(
  response: Response,
  metadata: WebSocketUpgradeMetadata
): void {
  Object.defineProperty(response, WEBSOCKET_UPGRADE, { value: metadata })
}

/** @internal */
export function getWebSocketUpgradeMetadata(
  response: Response
): WebSocketUpgradeMetadata | undefined {
  return (
    response as Response & {
      [WEBSOCKET_UPGRADE]?: WebSocketUpgradeMetadata
    }
  )[WEBSOCKET_UPGRADE]
}

/** @internal */
export function isWebSocketUpgradeResponse(response: Response): boolean {
  return getWebSocketUpgradeMetadata(response) !== undefined
}
