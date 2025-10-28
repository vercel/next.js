import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NextConfigComplete } from '../../config-shared'
import type { UrlWithParsedQuery } from 'node:url'
import type { ServerCacheStatus } from '../../../next-devtools/dev-overlay/cache-indicator'

export type RevalidateFn = (config: {
  urlPath: string
  revalidateHeaders: { [key: string]: string | string[] }
  opts: { unstable_onlyGenerated?: boolean }
}) => Promise<void>

// The RouterServerContext contains instance specific
// information that isn't available/relevant when
// deployed in serverless environments, the key is
// the relative project dir this allows separate contexts
// when running multiple next instances in same process
export type RouterServerContext = Record<
  string,
  {
    // hostname the server is started with
    hostname?: string
    // revalidate function to bypass going through network
    // to invoke revalidate request (uses mocked req/res)
    revalidate?: RevalidateFn
    // function to render the 404 page
    render404?: (
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: UrlWithParsedQuery,
      setHeaders?: boolean
    ) => Promise<void>
    // exposing nextConfig for dev mode specifically
    nextConfig?: NextConfigComplete
    // whether running in custom server mode
    isCustomServer?: boolean
    // whether test proxy is enabled
    experimentalTestProxy?: boolean
    // allow dev server to log with original stack
    logErrorWithOriginalStack?: (err: unknown, type: string) => void
    // allow setting ISR status in dev
    setIsrStatus?: (key: string, value: boolean | undefined) => void
    setReactDebugChannel?: (
      debugChannel: { readable: ReadableStream<Uint8Array> },
      htmlRequestId: string,
      requestId: string
    ) => void
    setCacheStatus?: (
      status: ServerCacheStatus,
      htmlRequestId: string,
      requestId: string
    ) => void
  }
>

export const RouterServerContextSymbol = Symbol.for(
  '@next/router-server-methods'
)

export const routerServerGlobal = globalThis as typeof globalThis & {
  [RouterServerContextSymbol]?: RouterServerContext
}
