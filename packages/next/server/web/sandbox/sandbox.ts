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

  const subreq = params.request.headers[`x-middleware-subrequest`]
  const subrequests = typeof subreq === 'string' ? subreq.split(':') : []
  if (subrequests.includes(params.name)) {
    return {
      waitUntil: Promise.resolve(),
      response: new context.Response(null, {
        headers: {
          'x-middleware-next': '1',
        },
      }),
    }
  }

  return context._ENTRIES[`middleware_${params.name}`].default({
    request: params.request,
  })
}
