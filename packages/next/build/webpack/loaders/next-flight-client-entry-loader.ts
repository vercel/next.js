export default async function transformSource(this: any): Promise<string> {
  let { modules } = this.getOptions()
  if (!Array.isArray(modules)) {
    modules = [modules]
  }

  return (
    modules
      .map(
        (request: string) => `import(/* webpackMode: "eager" */ '${request}')`
      )
      .join(';') +
    `;export const __next_rsc_client_entry__ = {
      __webpack_require__
    }`
  )
}
