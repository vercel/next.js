// @ts-ignore
import asyncRetry from 'next/dist/compiled/async-retry'

export async function retry<T>(
  fn: asyncRetry.RetryFunction<T>,
  retries: number
) {
  return await asyncRetry(fn, {
    retries,
    onRetry(e: Error, attempt: number) {
      console.error(e.message + `\n\nRetrying ${attempt}/${retries}...`)
    },
    minTimeout: 100,
  })
}
