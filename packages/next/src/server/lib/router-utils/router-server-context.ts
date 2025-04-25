export type RevalidateFn = (config: {
  urlPath: string
  revalidateHeaders: { [key: string]: string | string[] }
  opts: { unstable_onlyGenerated?: boolean }
}) => Promise<void>

// The RouterServerContext contains instance specific
// information that isn't available/relevant when
// deployed in serverless environments
export interface RouterServerContext {
  dir?: string
  // hostname the server is started with
  hostname?: string
  // revalidate function to bypass going through network
  // to invoke revalidate request (uses mocked req/res)
  revalidate?: RevalidateFn
}

export const RouterServerContextSymbol = Symbol.for(
  '@next/router-server-methods'
)

export const routerServerGlobal = globalThis as typeof globalThis & {
  [RouterServerContextSymbol]?: RouterServerContext
}
