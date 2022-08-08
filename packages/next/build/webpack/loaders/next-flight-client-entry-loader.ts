import { SERVER_RUNTIME } from '../../../lib/constants'

export default async function transformSource(this: any): Promise<string> {
  let { modules, runtime, ssr, server } = this.getOptions()
  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }

  const requests = modules as string[]
  const code =
    requests
      .filter((request) => (server ? !request.endsWith('.css') : true))
      .map((request) => `import(/* webpackMode: "eager" */ '${request}')`)
      .join(';\n') +
    `
    export const __next_rsc_css__ = ${JSON.stringify(
      requests.filter((request) => request.endsWith('.css'))
    )};
    export const __next_rsc__ = {
      server: false,
      __webpack_require__
    };
    export default function RSC() {};
    ` +
    // Currently for the Edge runtime, we treat all RSC pages as SSR pages.
    (runtime === SERVER_RUNTIME.edge
      ? 'export const __N_SSP = true;'
      : ssr
      ? `export const __N_SSP = true;`
      : `export const __N_SSG = true;`)

  return code
}
