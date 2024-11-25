import type { NextConfig } from '../../types'

let runtimeConfig: any

export default () => {
  return runtimeConfig
}

export function setConfig(configValue: any): void {
  runtimeConfig = configValue
}

/**
 * Type helper to make it easier to use `next.config.ts`
 */
export function defineConfig(config: NextConfig): NextConfig {
  return config
}
