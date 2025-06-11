// Convert router.asPath to a URLSearchParams object
// example: /dynamic/[slug]?foo=bar -> { foo: 'bar' }
export function asPathToSearchParams(asPath: string): URLSearchParams {
  const asPathWithoutLeadingSlashes = asPath.replace(/^\/{2,}/, '/')
  return new URL(asPathWithoutLeadingSlashes, 'http://n').searchParams
}
