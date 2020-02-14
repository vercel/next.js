import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { processEnv } from './process-env'
import { existsSync } from './find-pages-dir'
import { ENV_CONFIG_FILE } from '../next-server/lib/constants'

type EnvironmentKey = {
  description: string
  required?: boolean // defaults to false
  defaultValue?: string // the default value
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

// loads andy maybe populate env config items
export function loadEnvConfig(dir: string): Env
export function loadEnvConfig(
  dir: string,
  processItems: false
): EnvironmentConfig
export function loadEnvConfig(dir: any, processItems?: any): any {
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
  if (processItems === false) {
    return _Env
  }
  // only load .env if the user provided has an env config file
  const dotEnv = path.join(dir, '.env')
  const result = dotenv.config({ path: dotEnv })

  if (result.parsed) {
    console.log(`Loaded .env from ${dotEnv}`)
  }
  return processEnv(_Env)
}
