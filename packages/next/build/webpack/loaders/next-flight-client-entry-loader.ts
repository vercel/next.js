import { SERVER_RUNTIME } from '../../../lib/constants'

export default async function transformSource(this: any): Promise<string> {
  let { modules, runtime, ssr } = this.getOptions()
  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }

  return (
    modules
      .map(
        (request: string) => `import(/* webpackMode: "eager" */ '${request}')`
      )
      .join(';') +
    `
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
  )
}
