// Convert router.asPath to a URLSearchParams object
// example: /dynamic/[slug]?foo=bar -> { foo: 'bar' }
export function asPathToSearchParams(asPath: string): URLSearchParams {
  return new URL(asPath, 'http://n').searchParams
}
