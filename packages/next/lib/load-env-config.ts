import fs from 'fs'
import path from 'path'
import { existsSync } from './find-pages-dir'
import { ENV_CONFIG_FILE } from '../next-server/lib/constants'

type EnvironmentKey = {
  description: string
  required?: boolean // defaults to false
  value?: string // the default value
  env?: {
    development: Omit<EnvironmentKey, 'env'>
    production: Omit<EnvironmentKey, 'env'>
    test: Omit<EnvironmentKey, 'env'>
  }
}
export type EnvironmentConfig = {
  [key: string]: EnvironmentKey
}

export type Env = { [key: string]: string }

export function processEnv(_Env: EnvironmentConfig): Env {
  const missingEnvItems = new Set()
  const Env: Env = {}

  for (const key of Object.keys(_Env)) {
    const envItem = _Env[key]
    let curValue: string | undefined = envItem.value
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

        if (subEnv.value) {
          curValue = subEnv.value
        }
      }
    }

    if (curValue) {
      Env[key] = curValue
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
  return Env
}

// loads andy maybe populate env config items
export function loadEnvConfig(dir: string): Env
export function loadEnvConfig(dir: string, process: false): EnvironmentConfig
export function loadEnvConfig(dir: any, process?: any): any {
  const envPath = path.join(dir, ENV_CONFIG_FILE)

  // don't use require so it's not cached in module cache
  // in case we want to reload this file
  if (!existsSync(envPath)) {
    return {}
  }
  // don't use require so it's not cached in module cache
  // in case we want to reload this file
  const _Env: EnvironmentConfig = JSON.parse(fs.readFileSync(envPath, 'utf8'))

  // TODO: do we want to validate extra/invalid fields in env.json?
  if (process === false) {
    return _Env
  }
  return processEnv(_Env)
}
