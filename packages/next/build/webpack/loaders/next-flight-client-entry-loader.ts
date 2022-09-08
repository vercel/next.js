export type ClientComponentImports = string[]
export type CssImports = Record<string, string[]>

export type NextFlightClientEntryLoaderOptions = {
  modules: ClientComponentImports
  /** This is transmitted as a string to `getOptions` */
  server: boolean | 'true' | 'false'
}

export default async function transformSource(this: any): Promise<string> {
  let { modules, server }: NextFlightClientEntryLoaderOptions =
    this.getOptions()
  const isServer = server === 'true'

  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }

  const requests = modules as string[]
  const code =
    requests
      // Filter out css files on the server
      .filter((request) => (isServer ? !request.endsWith('.css') : true))
      .map((request) =>
        request.endsWith('.css')
          ? `(() => import(/* webpackMode: "lazy" */ ${JSON.stringify(
              request
            )}))`
          : `import(/* webpackMode: "eager" */ ${JSON.stringify(request)})`
      )
      .join(';\n') +
    `
    export const __next_rsc__ = {
      server: false,
      __webpack_require__
    };
    export default function RSC() {};
    `

  return code
}
