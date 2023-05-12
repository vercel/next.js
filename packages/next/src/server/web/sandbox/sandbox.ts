import type { NodejsRequestData, FetchEventResult, RequestData } from '../types'
import { getServerError } from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import { getModuleContext } from './context'
import { EdgeFunctionDefinition } from '../../../build/webpack/plugins/middleware-plugin'
import { requestToBodyStream } from '../../body-streams'
import type { EdgeRuntime } from 'next/dist/compiled/edge-runtime'

export const ErrorSource = Symbol('SandboxError')

const FORBIDDEN_HEADERS = [
  'content-length',
  'content-encoding',
  'transfer-encoding',
]

type RunnerFn = (params: {
  name: string
  env: string[]
  onWarning?: (warn: Error) => void
  paths: string[]
  request: NodejsRequestData
  useCache: boolean
  edgeFunctionEntry: Pick<EdgeFunctionDefinition, 'wasm' | 'assets'>
  distDir: string
  incrementalCache?: any
}) => Promise<FetchEventResult>

/**
 * Decorates the runner function making sure all errors it can produce are
 * tagged with `edge-server` so they can properly be rendered in dev.
 */
function withTaggedErrors(fn: RunnerFn): RunnerFn {
  return (params) =>
    fn(params)
      .then((result) => ({
        ...result,
        waitUntil: result?.waitUntil?.catch((error) => {
          // TODO: used COMPILER_NAMES.edgeServer instead. Verify that it does not increase the runtime size.
          throw getServerError(error, 'edge-server')
        }),
      }))
      .catch((error) => {
        // TODO: used COMPILER_NAMES.edgeServer instead
        throw getServerError(error, 'edge-server')
      })
}

export const getRuntimeContext = async (params: {
  name: string
  onWarning?: any
  useCache: boolean
  env: string[]
  edgeFunctionEntry: any
  distDir: string
  paths: string[]
  incrementalCache?: any
}): Promise<EdgeRuntime<any>> => {
  const { runtime, evaluateInContext } = await getModuleContext({
    moduleName: params.name,
    onWarning: params.onWarning ?? (() => {}),
    useCache: params.useCache !== false,
    env: params.env,
    edgeFunctionEntry: params.edgeFunctionEntry,
    distDir: params.distDir,
  })

  if (params.incrementalCache) {
    runtime.context.globalThis.__incrementalCache = params.incrementalCache
  }

  for (const paramPath of params.paths) {
    evaluateInContext(paramPath)
  }
  return runtime
}

export const run = withTaggedErrors(async (params) => {
  const runtime = await getRuntimeContext(params)
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

  const edgeFunction: (args: {
    request: RequestData
  }) => Promise<FetchEventResult> =
    runtime.context._ENTRIES[`middleware_${params.name}`].default

  const cloned = !['HEAD', 'GET'].includes(params.request.method)
    ? params.request.body?.cloneBodyStream()
    : undefined

  const KUint8Array = runtime.evaluate('Uint8Array')

  try {
    const result = await edgeFunction({
      request: {
        ...params.request,
        body:
          cloned && requestToBodyStream(runtime.context, KUint8Array, cloned),
      },
    })
    for (const headerName of FORBIDDEN_HEADERS) {
      result.response.headers.delete(headerName)
    }
    return result
  } finally {
    await params.request.body?.finalize()
  }
})
