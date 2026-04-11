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
  if (!process.env.__NEXT_UNSTABLE_IO) {
    throw new Error(
      '`unstable_io()` requires the `experimental.unstableIO` option to be enabled in your Next.js config.'
    )
  }

  return resolvedIOPromise
}
