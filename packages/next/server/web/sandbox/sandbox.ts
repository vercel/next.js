import type { RequestData, FetchEventResult } from '../types'
import { getModuleContext } from './context'

export async function run(params: {
  name: string
  onWarning: (warn: Error) => void
  paths: string[]
  request: RequestData
  useCache: boolean
}): Promise<FetchEventResult> {
  const { runInContext, context } = getModuleContext({
    module: params.name,
    onWarning: params.onWarning,
    useCache: params.useCache !== false,
  })

  for (const paramPath of params.paths) {
    runInContext(paramPath)
  }

  return context._ENTRIES[`middleware_${params.name}`].default({
    request: params.request,
  })
}
