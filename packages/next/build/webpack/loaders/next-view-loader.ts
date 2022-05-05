import path from 'path'
import type webpack from 'webpack5'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'

function pathToUrlPath(pathname: string) {
  let urlPath = pathname.replace(/^private-next-views-dir/, '')

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

const extensions = [
  ...NODE_RESOLVE_OPTIONS.extensions,
  ...NODE_RESOLVE_OPTIONS.extensions.map((ext) => `.server${ext}`),
  ...NODE_RESOLVE_OPTIONS.extensions.map((ext) => `.client${ext}`),
]
const resolveOptions: any = {
  ...NODE_RESOLVE_OPTIONS,
  extensions,
}

const nextViewLoader: webpack.LoaderDefinitionFunction<{
  pagePath: string
  viewsDir: string
}> = async function nextViewLoader() {
  const loaderOptions = this.getOptions() || {}
  const resolve = this.getResolve(resolveOptions)
  const viewsDir = loaderOptions.viewsDir

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
      // use require so that we can bust the require cache
      const codeLine = `'${layoutPath}': () => require('${resolvedLayoutPath}')`
      componentsCode.push(codeLine)
    } else {
      for (const ext of extensions) {
        this.addMissingDependency(
          path.join(viewsDir, layoutPath, `layout${ext}`)
        )
      }
    }
  }

  // Add page itself to the list of components
  componentsCode.push(
    `'${pathToUrlPath(loaderOptions.pagePath).replace(
      new RegExp(`/page\\.+(${extensions.join('|')})$`),
      ''
      // use require so that we can bust the require cache
    )}': () => require('${loaderOptions.pagePath}')`
  )

  const result = `
    export const components = {
        ${componentsCode.join(',\n')}
    };
  `
  return result
}

export default nextViewLoader
