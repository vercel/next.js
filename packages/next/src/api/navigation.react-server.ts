import { errorClientApi } from '../client/components/client-hook-in-server-component-error'

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
