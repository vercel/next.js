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
    get: (target, key, receiver) => {
      envVars.add(key)
      return Reflect.get(target, key, receiver)
    },
    set: (target, key, value) => {
      return Reflect.set(target, key, value)
    },
  })

  const oldEnv = process.env
  process.env = newEnv

  // Return a function that restores the original environment.
  return () => {
    process.env = oldEnv
  }
}
