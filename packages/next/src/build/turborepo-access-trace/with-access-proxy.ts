import type { Paths, Addresses, EnvVars } from './types'

import { envProxy } from './env'
import { tcpProxy } from './tcp'
import { fsProxy } from './fs'
import { AccessProxy } from './result'

export async function withAccessProxy<T>(
  f: () => T | Promise<T>
): Promise<[T, AccessProxy]> {
  const envVars: EnvVars = new Set([])
  // addresses is an array of objects, so a set is useless
  const addresses: Addresses = []
  const paths: Paths = {
    read: new Set(),
    checked: new Set(),
  }

  // setup proxies
  const restoreTCP = tcpProxy(addresses)
  const restoreFS = fsProxy(paths)
  const restoreEnv = envProxy(envVars)

  // call the wrapped function
  let functionResult
  try {
    functionResult = await f()
  } finally {
    // remove proxies
    restoreTCP()
    restoreFS()
    restoreEnv()
  }

  const traceResult = new AccessProxy(envVars, addresses, paths)

  return [functionResult, traceResult]
}
