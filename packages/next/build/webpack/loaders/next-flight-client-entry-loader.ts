export default async function transformSource(this: any): Promise<string> {
  const { modules, runtime, ssr, isViews } = this.getOptions()
  const requests: string[] = !Array.isArray(modules)
    ? [modules].filter(Boolean)
    : modules

  const source =
    requests
      .map((request: string) => {
        const webpackMode = isViews ? 'lazy' : 'eager'
        return `import(/* webpackMode: "${webpackMode}" */ ${JSON.stringify(
          request
        )})`
      })
      .join(';\n') +
    `
    export const __next_rsc__ = {
      server: false,
      __webpack_require__
    };
    export default function RSC() {};
    ` +
    // Currently for the Edge runtime, we treat all RSC pages as SSR pages.
    (runtime === 'edge'
      ? 'export const __N_SSP = true;'
      : ssr
      ? `export const __N_SSP = true;`
      : `export const __N_SSG = true;`)

  return source
}
