import { isPageStatic } from './utils'

export default function worker(
  options: any,
  callback: (err: Error | null, data?: any) => void
) {
  try {
    const { serverBundle, runtimeEnvConfig } = options || ({} as any)
    const result = isPageStatic(serverBundle, runtimeEnvConfig)
    callback(null, result)
  } catch (error) {
    callback(error)
  }
}
