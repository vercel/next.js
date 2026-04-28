// A fulfilled thenable that React can unwrap synchronously via `use()` without
// ever suspending. Reusing a single instance avoids allocating on every call.
const resolvedIOPromise: Promise<void> = Promise.resolve(undefined)
;(resolvedIOPromise as any).status = 'fulfilled'
;(resolvedIOPromise as any).value = undefined

/**
 * Browser implementation of unstable_io(). On the client there is no
 * prerender context so we always resolve immediately.
 */
export function unstable_io(): Promise<void> {
  return resolvedIOPromise
}
