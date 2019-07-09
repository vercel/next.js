let runtimeConfig: any

export default () => {
  return runtimeConfig
}

export function setConfig(
  { publicRuntimeConfig, serverRuntimeConfig } = {} as any
) {
  runtimeConfig = {
    publicRuntimeConfig: publicRuntimeConfig || {},
    serverRuntimeConfig: serverRuntimeConfig || {},
  }
}
