/**
 * Thin dispatcher for synchronous IO tracking in node-environment extensions.
 *
 * The extensions (random, date, crypto) patch globals at environment setup
 * time and call syncIO() on every invocation. The actual implementation lives
 * in sync-io-handler.tsx and is registered when the app router rendering
 * runtime loads. This avoids pulling server runtime modules into the
 * environment setup path.
 */

type ApiType = 'time' | 'random' | 'crypto'

type SyncIOHandler = (expression: string, type: ApiType) => void

let handler: SyncIOHandler | null = null

export function registerSyncIOHandler(syncIOHandler: SyncIOHandler): void {
  handler = syncIOHandler
}

export function syncIO(expression: string, type: ApiType): void {
  if (handler !== null) {
    handler(expression, type)
  }
}
