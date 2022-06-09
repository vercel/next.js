import type { WasmBinding } from '../../build/webpack/loaders/get-module-build-info'
import type { RequestData, FetchEventResult } from '../../web/types'
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
  const { runtime, evaluateInContext } = await getModuleContext({
    moduleName: params.name,
    onWarning: params.onWarning,
    useCache: params.useCache !== false,
    env: params.env,
    wasm: params.wasm,
  })

  for (const paramPath of params.paths) {
    evaluateInContext(paramPath)
  }

  const subreq = params.request.headers[`x-middleware-subrequest`]
  const subrequests = typeof subreq === 'string' ? subreq.split(':') : []
  if (subrequests.includes(params.name)) {
    return {
      waitUntil: Promise.resolve(),
      response: new runtime.context.Response(null, {
        headers: {
          'x-middleware-next': '1',
        },
      }),
    }
  }

  return runtime.context._ENTRIES[`middleware_${params.name}`].default({
    request: params.request,
  })
}
