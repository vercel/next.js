let runtimeConfig: any

/**
 * @deprecated Runtime config is deprecated and will be removed in Next.js 16.
 */
export default () => {
  return runtimeConfig
}

/**
 * @deprecated Runtime config is deprecated and will be removed in Next.js 16.
 */
export function setConfig(configValue: any): void {
  runtimeConfig = configValue
}
