import type { EnvVars, RestoreOriginalFunction } from './types'

/**
 * Proxy the environment to track environment variables keys that
 * are accessed during the build.
 *
 * @param envVars A set to track environment variable keys that are accessed.
 * @returns A function that restores the original environment.
 */
export function envProxy(envVars: EnvVars): RestoreOriginalFunction {
  const newEnv = new Proxy(process.env, {
    get: (target, key) => {
      envVars.add(key)
      return target[key as string]
    },
    getOwnPropertyDescriptor(_target, _key) {
      return { configurable: true, enumerable: true }
    },
    set: (target, key, value) => {
      target[key as string] = value
      return true
    },
  })

  const oldEnv = process.env
  process.env = newEnv

  // Return a function that restores the original environment.
  return () => {
    process.env = oldEnv
  }
}
