import { isPageStatic } from './utils'

export default function worker(options: {
  serverBundle: string
  runtimeEnvConfig: any
}) {
  const { serverBundle, runtimeEnvConfig } = options || ({} as any)
  return isPageStatic(serverBundle, runtimeEnvConfig)
}
