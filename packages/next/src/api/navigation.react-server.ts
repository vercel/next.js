function errorClientApi(api: string) {
  const message = `${api} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
  throw new Error(message)
}

export function useSearchParams() {
  errorClientApi('useSearchParams')
}
export function usePathname() {
  errorClientApi('usePathname')
}
export function useSelectedLayoutSegment() {
  errorClientApi('useSelectedLayoutSegment')
}
export function useSelectedLayoutSegments() {
  errorClientApi('useSelectedLayoutSegments')
}
export function useParams() {
  errorClientApi('useParams')
}
export function useRouter() {
  errorClientApi('useRouter')
}
export function useServerInsertedHTML() {
  errorClientApi('useServerInsertedHTML')
}
export function ServerInsertedHTMLContext() {
  errorClientApi('ServerInsertedHTMLContext')
}

export * from '../client/components/navigation.react-server'
