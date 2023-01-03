let runtimeConfig: any

export default () => {
  return runtimeConfig
}

export function setConfig(configValue: any): void {
  runtimeConfig = configValue
}
