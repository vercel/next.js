import type { EnvironmentStubs } from '../assertions/utilities'

type EnvValue = string | boolean | undefined
const env: Record<string, EnvValue> = {}
let seeded = false
let configured: Record<string, string> = {}

/** The actual client bootstrap configures this realm before authored evaluation. */
export function configureBrowserEnv(
  values: Record<string, string> = {},
  defaults?: Record<string, EnvValue>
): void {
  if (defaults) getBrowserEnv(defaults)
  configured = values
  if (seeded) Object.assign(env, configured)
}

/** Each native import.meta binding reads the same file record and native defaults. */
export function getBrowserEnv(
  defaults: Record<string, EnvValue>
): Record<string, EnvValue> {
  if (!seeded) {
    Object.assign(env, defaults, configured)
    seeded = true
  }
  return env
}

/** Published Browser vi uses the value saved before the first stub for each name. */
export function createEnvironmentStubs(): EnvironmentStubs {
  const originals = new Map<string, EnvValue>()
  return {
    stub(name, value) {
      if (!originals.has(name)) originals.set(name, env[name])
      if (value === undefined) delete env[name]
      else if (['DEV', 'PROD', 'SSR'].includes(name))
        env[name] = value ? '1' : ''
      else env[name] = String(value)
    },
    restore() {
      for (const [name, value] of originals) {
        if (value === undefined) delete env[name]
        else env[name] = value
      }
      originals.clear()
    },
  }
}
