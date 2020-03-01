let runtimeConfig: any

export default () => {
  return runtimeConfig
}

export function setConfig(configValue: any) {
  runtimeConfig = configValue
}
