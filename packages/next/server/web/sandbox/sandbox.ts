import type { WasmBinding } from '../../../build/webpack/loaders/get-module-build-info'
import type { RequestData, FetchEventResult } from '../types'
import { getModuleContext } from './context'

export async function run(params: {
  name: string
  env: string[]
  onWarning: (warn: Error) => void
  paths: string[]
  request: RequestData
  useCache: boolean
  wasm: WasmBinding[]
}): Promise<FetchEventResult> {
  const { runInContext, context } = await getModuleContext({
    module: params.name,
    onWarning: params.onWarning,
    useCache: params.useCache !== false,
    env: params.env,
    wasm: params.wasm,
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
