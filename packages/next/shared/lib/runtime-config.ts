let runtimeConfig: any

export const getConfig = () => runtimeConfig

export default getConfig

export function setConfig(configValue: any): void {
  runtimeConfig = configValue
}
