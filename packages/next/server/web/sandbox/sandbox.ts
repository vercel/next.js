import type { NodejsRequestData, FetchEventResult, RequestData } from '../types'
import { getServerError } from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import { getModuleContext } from './context'
import { EdgeFunctionDefinition } from '../../../build/webpack/plugins/middleware-plugin'
import { requestToBodyStream } from '../../body-streams'

export const ErrorSource = Symbol('SandboxError')

type RunnerFn = (params: {
  name: string
  env: string[]
  onWarning?: (warn: Error) => void
  paths: string[]
  request: NodejsRequestData
  useCache: boolean
  edgeFunctionEntry: Pick<EdgeFunctionDefinition, 'wasm' | 'assets'>
  distDir: string
}) => Promise<FetchEventResult>

export const run = withTaggedErrors(async (params) => {
  const { runtime, evaluateInContext } = await getModuleContext({
    moduleName: params.name,
    onWarning: params.onWarning ?? (() => {}),
    useCache: params.useCache !== false,
    env: params.env,
    edgeFunctionEntry: params.edgeFunctionEntry,
    distDir: params.distDir,
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

  const edgeFunction: (args: {
    request: RequestData
  }) => Promise<FetchEventResult> =
    runtime.context._ENTRIES[`middleware_${params.name}`].default

  const cloned = !['HEAD', 'GET'].includes(params.request.method)
    ? params.request.body?.cloneBodyStream()
    : undefined

  try {
    return await edgeFunction({
      request: {
        ...params.request,
        body: cloned && requestToBodyStream(runtime.context, cloned),
      },
    })
  } finally {
    await params.request.body?.finalize()
  }
})

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
          throw getServerError(error, 'edge-server')
        }),
      }))
      .catch((error) => {
        throw getServerError(error, 'edge-server')
      })
}
