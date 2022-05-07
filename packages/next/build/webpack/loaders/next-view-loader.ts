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
  resolve: (pathname: string) => Promise<string | undefined>
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
  viewsDir: string
  pageExtensions: string[]
}> = async function nextViewLoader() {
  const { viewsDir, pagePath, pageExtensions } = this.getOptions() || {}

  const extensions = pageExtensions.map((extension) => `.${extension}`)
  const resolveOptions: any = {
    ...NODE_RESOLVE_OPTIONS,
    extensions,
  }
  const resolve = this.getResolve(resolveOptions)

  const layoutPaths = await resolveLayoutPathsByPage({
    pagePath: pagePath,
    resolve: async (pathname) => {
      try {
        return await resolve(this.rootContext, pathname)
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
    `'${pathToUrlPath(pagePath).replace(
      new RegExp(`/page\\.+(${extensions.join('|')})$`),
      ''
      // use require so that we can bust the require cache
    )}': () => require('${pagePath}')`
  )

  const result = `
    export const components = {
        ${componentsCode.join(',\n')}
    };
  `
  return result
}

export default nextViewLoader
