import type webpack from 'webpack5'

const nextViewLoader: webpack.LoaderDefinitionFunction<{
  components: string[]
}> = function nextViewLoader() {
  const loaderOptions = this.getOptions() || {}

  return `
    export const components = {
        ${loaderOptions.components
          .map((component) => `'${component}': () => import('${component}')`)
          .join(',\n')}
    }
  `
}

export default nextViewLoader
