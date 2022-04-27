export default async function transformSource(this: any): Promise<string> {
  // @TODO: this.getOptions doesn't seem to work for inlined requests.
  const query = this.resourceQuery

  const modules = JSON.parse(
    decodeURIComponent(query).slice('?modules='.length)
  )

  return (
    modules
      .map((request: string) => {
        return `import(/* webpackMode: "eager" */ '!${request}?__sc_client__')`
      })
      .join(';') +
    `;export const __next_rsc_client_entry__ = {
      __webpack_require__: path => __webpack_require__(path + '?__sc_client__')
    }`
  )
}
