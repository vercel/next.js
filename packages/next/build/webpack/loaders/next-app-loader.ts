import path from 'path'
import type webpack from 'webpack5'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'
import { getModuleBuildInfo } from './get-module-build-info'

function pathToUrlPath(pathname: string) {
  let urlPath = pathname.replace(/^private-next-app-dir/, '')

  // For `app/layout.js`
  if (urlPath === '') {
    urlPath = '/'
  }

  return urlPath
}

async function resolvePathsByPage({
  name,
  pagePath,
  resolve,
}: {
  name: 'layout' | 'loading'
  pagePath: string
  resolve: (pathname: string) => Promise<string | undefined>
}) {
  const paths = new Map<string, string | undefined>()
  const parts = pagePath.split('/')
  const isNewRootLayout =
    parts[1]?.length > 2 && parts[1]?.startsWith('(') && parts[1]?.endsWith(')')

  for (let i = parts.length; i >= 0; i--) {
    const pathWithoutSlashLayout = parts.slice(0, i).join('/')

    if (!pathWithoutSlashLayout) {
      continue
    }
    const layoutPath = `${pathWithoutSlashLayout}/${name}`
    let resolvedLayoutPath = await resolve(layoutPath)
    let urlPath = pathToUrlPath(pathWithoutSlashLayout)

    // if we are in a new root app/(root) and a custom root layout was
    // not provided or a root layout app/layout is not present, we use
    // a default root layout to provide the html/body tags
    const isCustomRootLayout = name === 'layout' && isNewRootLayout && i === 2

    if (
      name === 'layout' &&
      (isCustomRootLayout || i === 1) &&
      !resolvedLayoutPath
    ) {
      resolvedLayoutPath = await resolve('next/dist/lib/app-layout')
    }
    paths.set(urlPath, resolvedLayoutPath)

    // if we're in a new root layout don't add the top-level app/layout
    if (isCustomRootLayout) {
      break
    }
  }
  return paths
}

const nextAppLoader: webpack.LoaderDefinitionFunction<{
  name: string
  pagePath: string
  appDir: string
  pageExtensions: string[]
}> = async function nextAppLoader() {
  const { name, appDir, pagePath, pageExtensions } = this.getOptions() || {}

  const buildInfo = getModuleBuildInfo((this as any)._module)
  buildInfo.route = {
    page: name.replace(/^app/, ''),
    absolutePagePath: appDir + pagePath.replace(/^private-next-app-dir/, ''),
  }

  const extensions = pageExtensions.map((extension) => `.${extension}`)
  const resolveOptions: any = {
    ...NODE_RESOLVE_OPTIONS,
    extensions,
  }
  const resolve = this.getResolve(resolveOptions)

  const loadingPaths = await resolvePathsByPage({
    name: 'loading',
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

  const loadingComponentsCode = []
  for (const [loadingPath, resolvedLoadingPath] of loadingPaths) {
    if (resolvedLoadingPath) {
      this.addDependency(resolvedLoadingPath)
      // use require so that we can bust the require cache
      const codeLine = `'${loadingPath}': () => require('${resolvedLoadingPath}')`
      loadingComponentsCode.push(codeLine)
    } else {
      for (const ext of extensions) {
        this.addMissingDependency(
          path.join(appDir, loadingPath, `layout${ext}`)
        )
      }
    }
  }

  const layoutPaths = await resolvePathsByPage({
    name: 'layout',
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
        this.addMissingDependency(path.join(appDir, layoutPath, `layout${ext}`))
      }
    }
  }

  // Add page itself to the list of components
  componentsCode.push(
    `'${pathToUrlPath(pagePath).replace(
      new RegExp(`(${extensions.join('|')})$`),
      ''
      // use require so that we can bust the require cache
    )}': () => require('${pagePath}')`
  )

  const result = `
    export const components = {
        ${componentsCode.join(',\n')}
    };

    export const loadingComponents = {
      ${loadingComponentsCode.join(',\n')}
    };

    export const AppRouter = require('next/dist/client/components/app-router.client.js').default
    export const LayoutRouter = require('next/dist/client/components/layout-router.client.js').default

    export const __next_app_webpack_require__ = __webpack_require__
  `
  return result
}

export default nextAppLoader
