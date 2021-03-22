let runtimeConfig: any

export const getConfig = () => {
  return runtimeConfig
}
export default getConfig

export function setConfig(configValue: any): void {
  runtimeConfig = configValue
}
