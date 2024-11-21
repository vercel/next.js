import type { NodejsRequestData, FetchEventResult, RequestData } from '../types'
import type { EdgeFunctionDefinition } from '../../../build/webpack/plugins/middleware-plugin'
import type { EdgeRuntime } from 'next/dist/compiled/edge-runtime'
import {
  getModuleContext,
  requestStore,
  edgeSandboxNextRequestContext,
} from './context'
import { requestToBodyStream } from '../../body-streams'
import { NEXT_RSC_UNION_QUERY } from '../../../client/components/app-router-headers'
import type { ServerComponentsHmrCache } from '../../response-cache'
import {
  getBuiltinRequestContext,
  type BuiltinRequestContextValue,
} from '../../after/builtin-request-context'

export const ErrorSource = Symbol('SandboxError')

const FORBIDDEN_HEADERS = [
  'content-length',
  'content-encoding',
  'transfer-encoding',
]

interface RunnerFnParams {
  name: string
  onError?: (err: unknown) => void
  onWarning?: (warn: Error) => void
  paths: string[]
  request: NodejsRequestData
  useCache: boolean
  edgeFunctionEntry: Pick<EdgeFunctionDefinition, 'assets' | 'wasm' | 'env'>
  distDir: string
  incrementalCache?: any
  serverComponentsHmrCache?: ServerComponentsHmrCache
}

type RunnerFn = (params: RunnerFnParams) => Promise<FetchEventResult>

/**
 * Decorates the runner function making sure all errors it can produce are
 * tagged with `edge-server` so they can properly be rendered in dev.
 */
function withTaggedErrors(fn: RunnerFn): RunnerFn {
  if (process.env.NODE_ENV === 'development') {
    const { getServerError } =
      require('../../../client/components/react-dev-overlay/server/middleware-webpack') as typeof import('../../../client/components/react-dev-overlay/server/middleware-webpack')

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

  return fn
}

export async function getRuntimeContext(
  params: Omit<RunnerFnParams, 'request'>
): Promise<EdgeRuntime<any>> {
  const { runtime, evaluateInContext } = await getModuleContext({
    moduleName: params.name,
    onWarning: params.onWarning ?? (() => {}),
    onError: params.onError ?? (() => {}),
    useCache: params.useCache !== false,
    edgeFunctionEntry: params.edgeFunctionEntry,
    distDir: params.distDir,
  })

  if (params.incrementalCache) {
    runtime.context.globalThis.__incrementalCache = params.incrementalCache
  }

  if (params.serverComponentsHmrCache) {
    runtime.context.globalThis.__serverComponentsHmrCache =
      params.serverComponentsHmrCache
  }

  for (const paramPath of params.paths) {
    evaluateInContext(paramPath)
  }
  return runtime
}

export const run = withTaggedErrors(async function runWithTaggedErrors(params) {
  const runtime = await getRuntimeContext(params)
  const subreq = params.request.headers[`x-middleware-subrequest`]
  const subrequests = typeof subreq === 'string' ? subreq.split(':') : []

  const MAX_RECURSION_DEPTH = 5
  const depth = subrequests.reduce(
    (acc, curr) => (curr === params.name ? acc + 1 : acc),
    0
  )

  if (depth >= MAX_RECURSION_DEPTH) {
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
  }) => Promise<FetchEventResult> = (
    await runtime.context._ENTRIES[`middleware_${params.name}`]
  ).default

  const cloned = !['HEAD', 'GET'].includes(params.request.method)
    ? params.request.body?.cloneBodyStream()
    : undefined

  const KUint8Array = runtime.evaluate('Uint8Array')
  const urlInstance = new URL(params.request.url)
  urlInstance.searchParams.delete(NEXT_RSC_UNION_QUERY)

  params.request.url = urlInstance.toString()

  const headers = new Headers()
  for (const [key, value] of Object.entries(params.request.headers)) {
    headers.set(key, value?.toString() ?? '')
  }

  try {
    let result: FetchEventResult | undefined = undefined
    const builtinRequestCtx: BuiltinRequestContextValue = {
      ...getBuiltinRequestContext(),
      // FIXME(after):
      // arguably, this is an abuse of "@next/request-context" --
      // it'd make more sense to simply forward its existing value into the sandbox (in `createModuleContext`)
      // but here we're using it to just pass in `waitUntil` regardless if we were running in this context or not.
      waitUntil: params.request.waitUntil,
    }
    await edgeSandboxNextRequestContext.run(builtinRequestCtx, () =>
      requestStore.run({ headers }, async () => {
        result = await edgeFunction({
          request: {
            ...params.request,
            body:
              cloned &&
              requestToBodyStream(runtime.context, KUint8Array, cloned),
          },
        })
        for (const headerName of FORBIDDEN_HEADERS) {
          result.response.headers.delete(headerName)
        }
      })
    )

    if (!result) throw new Error('Edge function did not return a response')
    return result
  } finally {
    await params.request.body?.finalize()
  }
})
