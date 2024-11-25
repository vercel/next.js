import type { NextConfig } from '../../types'

let runtimeConfig: any

export default () => {
  return runtimeConfig
}

export function setConfig(configValue: any): void {
  runtimeConfig = configValue
}

export function defineConfig(config: NextConfig): NextConfig {
  return config
}
