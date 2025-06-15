import { after, connection } from 'next/server'
import { cliLog } from '../../../utils/log'

export default async function Index() {
  await connection()

  // This test checks if `after` callbacks scheduled from `after(promise)` are executed if
  // - the promise resolves after the response ended
  // - no `after(callback)` calls occurred before the response ended
  // We had a bug where the after callback queue wouldn't start if no `after(callback)` calls occured during the response,
  // so the callback scheduled from the promise would never run.

  const promise = (async () => {
    // hackily wait for the response to finish
    await new Promise((resolve) => setTimeout(resolve, 500))

    after(() => {
      cliLog({
        source: '[page] /nested-after-from-slow-promise',
      })
    })
  })()

  after(promise)

  return <div>Page with nested after() called from a slow promise</div>
}
