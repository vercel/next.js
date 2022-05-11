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
  const isNewRootLayout =
    parts[1]?.length > 2 && parts[1]?.startsWith('(') && parts[1]?.endsWith(')')

  for (let i = parts.length; i >= 0; i--) {
    const pathWithoutSlashLayout = parts.slice(0, i).join('/')

    if (!pathWithoutSlashLayout) {
      continue
    }
    const layoutPath = `${pathWithoutSlashLayout}/layout`
    let resolvedLayoutPath = await resolve(layoutPath)
    let urlPath = pathToUrlPath(pathWithoutSlashLayout)

    // if we are in a new root views/(root) and a custom root layout was
    // not provided or a root layout views/layout is not present, we use
    // a default root layout to provide the html/body tags
    const isCustomRootLayout = isNewRootLayout && i === 2

    if ((isCustomRootLayout || i === 1) && !resolvedLayoutPath) {
      resolvedLayoutPath = await resolve('next/dist/lib/views-layout')
    }
    layoutPaths.set(urlPath, resolvedLayoutPath)

    // if we're in a new root layout don't add the top-level view/layout
    if (isCustomRootLayout) {
      break
    }
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
      new RegExp(`/page+(${extensions.join('|')})$`),
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
