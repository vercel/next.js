// Translates a logical route into its pages asset path (relative from a common prefix)
// "asset path" being its javascript file, data file, prerendered html,...
export default function getAssetPathFromRoute(
  route: string,
  ext: string = ''
): string {
  const path =
    route === '/'
      ? '/index'
      : /^\/index(\/|$)/.test(route)
      ? `/index${route}`
      : route
  return path + ext
}
