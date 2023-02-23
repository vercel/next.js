import type { ReadonlyURLSearchParams } from 'next/navigation'

declare module 'next/navigation' {
  /**
   * Get a read-only URLSearchParams object. For example searchParams.get('foo') would return 'bar' when ?foo=bar
   * Learn more about URLSearchParams here: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
   */
  export function useSearchParams(): ReadonlyURLSearchParams

  /**
   * Get the current pathname. For example, if the URL is
   * https://example.com/foo?bar=baz, the pathname would be /foo.
   */
  export function usePathname(): string

  // Re-export the types for next/navigation.
  export * from 'next/dist/client/components/navigation'
}
