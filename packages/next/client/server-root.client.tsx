import { createContext, useContext } from 'react'

export type ServerResponse = {
  readRoot(): JSX.Element
}
type ServerResponseHook = (query: any, root: boolean) => ServerResponse

export const ServerResponseContext = createContext<ServerResponseHook | null>(
  null
)

export function ServerRoot({ query, root }: { query: any; root: boolean }) {
  const useServerResponse = useContext(ServerResponseContext)
  if (!useServerResponse) {
    throw new Error(
      'invariant: expected ServerResponseContext to be set. This is a bug in Next.js'
    )
  }
  const response = useServerResponse(query, root)
  return response.readRoot()
}
