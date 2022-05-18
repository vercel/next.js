import { parse } from '../../swc'

export default async function transformSource(
  this: any,
  source: string
): Promise<string> {
  const { resourcePath } = this

  const ast = await parse(source, {
    filename: resourcePath,
    isModule: 'unknown',
  })
  const isModule = ast.type === 'Module'

  return (
    source +
    (isModule
      ? `
      export const __next_rsc__ = {
        __webpack_require__,
        server: true
      }
    `
      : `
      exports.__next_rsc__ = {
        __webpack_require__,
        server: true
      }
    `)
  )
}
