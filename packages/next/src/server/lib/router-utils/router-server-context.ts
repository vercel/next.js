import type { NextConfigComplete } from '../../config-shared'

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
    // current loaded public runtime config
    publicRuntimeConfig?: NextConfigComplete['publicRuntimeConfig']
    // exposing nextConfig for dev mode specifically
    nextConfig?: NextConfigComplete
    // whether running in custom server mode
    isCustomServer?: boolean
  }
>

export const RouterServerContextSymbol = Symbol.for(
  '@next/router-server-methods'
)

export const routerServerGlobal = globalThis as typeof globalThis & {
  [RouterServerContextSymbol]?: RouterServerContext
}
