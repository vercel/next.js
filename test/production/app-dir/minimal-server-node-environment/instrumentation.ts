import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

// A logger setup that prefixes every line with the time, like `console-stamp`
// does. The hook runs after the server was loaded and before the first route
// module is.
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // What each call of the replaced method ran in: the type of the render's
  // store, or `null` outside of one.
  const calls: Array<string | null> = []
  ;(globalThis as any).__instrumentedLogCalls = calls

  const log = console.log
  console.log = function (this: Console, ...args: unknown[]) {
    calls.push(workUnitAsyncStorage.getStore()?.type ?? null)
    return log.call(this, `[${new Date().toISOString()}]`, ...args)
  }
}
