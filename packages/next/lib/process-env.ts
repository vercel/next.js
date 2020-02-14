import { ENV_CONFIG_FILE } from '../next-server/lib/constants'
import { EnvironmentConfig, Env } from './load-env-config'

export function processEnv(_env: EnvironmentConfig): Env {
  const missingEnvItems = new Set()
  const env: Env = {}

  for (const key of Object.keys(_env)) {
    const envItem = _env[key]
    let curValue: string | undefined = envItem.defaultValue
    let isRequired = envItem.required

    if (process.env[key]) {
      curValue = process.env[key]
    } else if (envItem.env) {
      const nodeEnv = process.env.NODE_ENV
      const subEnv = envItem.env[nodeEnv]

      if (subEnv) {
        if (typeof subEnv.required === 'boolean') {
          isRequired = subEnv.required
        }

        if (subEnv.defaultValue) {
          curValue = subEnv.defaultValue
        }
      }
    }

    if (curValue) {
      env[key] = curValue
    } else if (isRequired) {
      missingEnvItems.add(key)
    }
  }

  if (missingEnvItems.size > 0) {
    throw new Error(
      `Required environment items from \`${ENV_CONFIG_FILE}\` are missing: ` +
        `${[...missingEnvItems].join(', ')}`
    )
  }
  return env
}
