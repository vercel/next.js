// A fulfilled thenable that React can unwrap synchronously via `use()` without
// ever suspending. Reusing a single instance avoids allocating on every call.
const resolvedIOPromise: Promise<void> = Promise.resolve(undefined)
// TODO(as-any): pre-existing cast, not yet reviewed
// eslint-disable-next-line @next/internal/no-as-any
;(resolvedIOPromise as any).status = 'fulfilled'
// TODO(as-any): pre-existing cast, not yet reviewed
// eslint-disable-next-line @next/internal/no-as-any
;(resolvedIOPromise as any).value = undefined

/**
 * Browser implementation of io(). On the client there is no
 * prerender context so we always resolve immediately.
 */
export function io(): Promise<void> {
  return resolvedIOPromise
}
