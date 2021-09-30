export function createPagePathTransformer(
  pageExtensions: string[],
  allowServerComponents: boolean
): (pagePath: string) => string {
  const transforms: Array<(x: string) => string> = [
    (x) => x.replace(new RegExp(`\\.+(${pageExtensions.join('|')})$`), ''),
    (x) => (allowServerComponents ? x.replace(/\.(client|server)$/, '') : x),
    (x) => x.replace(/\\/g, '/'),
    (x) => x.replace(/\/index$/, ''),
    (x) => (x === '' ? '/' : x),
  ]
  return (pagePath) =>
    transforms.reduce((path, transform) => transform(path), pagePath)
}
