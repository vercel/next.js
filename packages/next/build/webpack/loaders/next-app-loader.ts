import type webpack from 'webpack5'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'
import { getModuleBuildInfo } from './get-module-build-info'

async function createTreeCodeFromPath({
  pagePath,
  resolve,
  removeExt,
}: {
  pagePath: string
  resolve: (pathname: string) => Promise<string | undefined>
  removeExt: (pathToRemoveExtensions: string) => string
}) {
  let tree: undefined | string
  const splittedPath = pagePath.split('/')
  const appDirPrefix = splittedPath[0]

  const segments = ['', ...splittedPath.slice(1)]

  // segment.length - 1 because arrays start at 0 and we're decrementing
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = removeExt(segments[i])
    const segmentPath = segments.slice(0, i + 1).join('/')

    // First item in the list is the page which can't have layouts by itself
    if (i === segments.length - 1) {
      // Use '' for segment as it's the page. There can't be a segment called '' so this is the safest way to add it.
      tree = `['', {}, {page: () => require('${pagePath}')}]`
      continue
    }

    // For segmentPath === '' avoid double `/`
    const layoutPath = `${appDirPrefix}${segmentPath}/layout`
    // For segmentPath === '' avoid double `/`
    const loadingPath = `${appDirPrefix}${segmentPath}/loading`

    const resolvedLayoutPath = await resolve(layoutPath)
    const resolvedLoadingPath = await resolve(loadingPath)

    // Existing tree are the children of the current segment
    const children = tree

    tree = `['${segment}', {
      ${
        // When there are no children the current index is the page component
        children ? `children: ${children},` : ''
      }
    }, {
      ${
        resolvedLayoutPath
          ? `layout: () => require('${resolvedLayoutPath}'),`
          : ''
      }
      ${
        resolvedLoadingPath
          ? `loading: () => require('${resolvedLoadingPath}'),`
          : ''
      }
    }]`
  }

  return `const tree = ${tree};`
}

function createAbsolutePath(appDir: string, pathToTurnAbsolute: string) {
  return pathToTurnAbsolute.replace(/^private-next-app-dir/, appDir)
}

function removeExtensions(
  extensions: string[],
  pathToRemoveExtensions: string
) {
  const regex = new RegExp(`(${extensions.join('|')})$`.replace(/\./g, '\\.'))
  return pathToRemoveExtensions.replace(regex, '')
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
    absolutePagePath: createAbsolutePath(appDir, pagePath),
  }

  const extensions = pageExtensions.map((extension) => `.${extension}`)
  const resolveOptions: any = {
    ...NODE_RESOLVE_OPTIONS,
    extensions,
  }
  const resolve = this.getResolve(resolveOptions)

  const resolver = async (pathname: string) => {
    try {
      const resolved = await resolve(this.rootContext, pathname)
      this.addDependency(resolved)
      return resolved
    } catch (err: any) {
      const absolutePath = createAbsolutePath(appDir, pathname)
      for (const ext of extensions) {
        const absolutePathWithExtension = `${absolutePath}${ext}`
        this.addMissingDependency(absolutePathWithExtension)
      }
      if (err.message.includes("Can't resolve")) {
        return undefined
      }
      throw err
    }
  }

  const treeCode = await createTreeCodeFromPath({
    pagePath,
    resolve: resolver,
    removeExt: (p) => removeExtensions(extensions, p),
  })

  const result = `
    export ${treeCode}

    export const AppRouter = require('next/dist/client/components/app-router.client.js').default
    export const LayoutRouter = require('next/dist/client/components/layout-router.client.js').default
    export const HotReloader = ${
      // Disable HotReloader component in production
      this.mode === 'development'
        ? `require('next/dist/client/components/hot-reloader.client.js').default`
        : 'null'
    }

    export const __next_app_webpack_require__ = __webpack_require__
  `

  return result
}

export default nextAppLoader
