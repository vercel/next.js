import type webpack from 'webpack5'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'

function pathToUrlPath(path: string) {
  let urlPath = path.replace(/^private-next-views-dir/, '')

  // For `views/layout.js`
  if (urlPath === '') {
    urlPath = '/'
  }

  return urlPath
}

async function resolveLayoutPathsByPage({
  pagePath,
  resolve,
}: {
  pagePath: string
  resolve: (path: string) => Promise<string | undefined>
}) {
  const layoutPaths = new Map<string, string | undefined>()
  const parts = pagePath.split('/')

  for (let i = 1; i < parts.length; i++) {
    const pathWithoutSlashLayout = parts.slice(0, i).join('/')
    const layoutPath = `${pathWithoutSlashLayout}/layout`

    const resolvedLayoutPath = await resolve(layoutPath)

    let urlPath = pathToUrlPath(pathWithoutSlashLayout)

    layoutPaths.set(urlPath, resolvedLayoutPath)
  }

  return layoutPaths
}

const nextViewLoader: webpack.LoaderDefinitionFunction<{
  pagePath: string
}> = async function nextViewLoader() {
  const loaderOptions = this.getOptions() || {}

  // @ts-ignore This is valid currently
  const resolve = this.getResolve({
    ...NODE_RESOLVE_OPTIONS,
    extensions: [
      ...NODE_RESOLVE_OPTIONS.extensions,
      '.server.js',
      '.client.js',
      '.client.ts',
      '.server.ts',
      '.client.tsx',
      '.server.tsx',
    ],
  })
  const layoutPaths = await resolveLayoutPathsByPage({
    pagePath: loaderOptions.pagePath,
    resolve: async (path) => {
      try {
        return await resolve(this.rootContext, path)
      } catch (err: any) {
        if (err.message.includes("Can't resolve")) {
          return undefined
        }
        throw err
      }
    },
  })

  const componentsCode = []
  for (const [layoutPath, resolvedLayoutPath] of layoutPaths) {
    if (resolvedLayoutPath) {
      this.addDependency(resolvedLayoutPath)
      const codeLine = `'${layoutPath}': () => import('${resolvedLayoutPath}')`
      componentsCode.push(codeLine)
    } else {
      // TODO: create all possible paths
      // this.addMissingDependency(layoutPath)
    }
  }

  // Add page itself to the list of components
  componentsCode.push(
    `'${pathToUrlPath(loaderOptions.pagePath).replace(
      /\/page\.(server|client)\.(js|ts|tsx)$/,
      ''
    )}': () => import('${loaderOptions.pagePath}')`
  )

  const result = `
    export const components = {
        ${componentsCode.join(',\n')}
    };
  `

  console.log(result)

  return result
}

export default nextViewLoader
