let runtimeConfig: any

export default <T extends unknown>(): T => {
  return runtimeConfig as T
}

export function setConfig(configValue: any): void {
  runtimeConfig = configValue
}
