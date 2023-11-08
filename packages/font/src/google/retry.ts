// eslint-disable-next-line import/no-extraneous-dependencies
// @ts-expect-error File exists
import asyncRetry from 'next/dist/compiled/async-retry'

export async function retry<T>(
  fn: asyncRetry.RetryFunction<T>,
  retries: number
) {
  return await asyncRetry(fn, {
    retries,
    onRetry(e: unknown, attempt: unknown) {
      console.error(
        (e as Error).message + `\n\nRetrying ${attempt}/${retries}...`
      )
    },
    minTimeout: 100,
  })
}
