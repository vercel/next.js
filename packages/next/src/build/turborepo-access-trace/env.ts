import type { EnvVars } from './types'

export function envProxy(envVars: EnvVars): () => void {
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
  return () => {
    process.env = oldEnv
  }
}
