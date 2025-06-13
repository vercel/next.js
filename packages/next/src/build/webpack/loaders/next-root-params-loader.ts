import type { webpack } from 'next/dist/compiled/webpack/webpack'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { ensureLeadingSlash } from '../../../shared/lib/page-path/ensure-leading-slash'
import { getSegmentParam } from '../../../server/app-render/get-segment-param'

export type RootParamsLoaderOpts = {
  appDir: string
  pageExtensions: string[]
}

const rootParamsLoader: webpack.LoaderDefinitionFunction<RootParamsLoaderOpts> =
  async function () {
    const { appDir, pageExtensions } = this.getOptions()

    const rootLayoutFilePaths = await findRootLayouts({
      appDir: appDir,
      pageExtensions,
      trackDirectory:
        // Track every directory we traverse in case a layout gets added to it
        // (which would make it the new root layout for that subtree).
        // This is relevant both in dev (for file watching) and in prod (for caching).
        (directory) => this.addContextDependency(directory),
    })

    // Collect the param names from all root layouts.
    const allRootParams = new Set<string>()
    for (const rootLayoutFilePath of rootLayoutFilePaths) {
      const params = getParamsFromLayoutFilePath({
        appDir,
        layoutFilePath: rootLayoutFilePath,
      })
      for (const param of params) {
        allRootParams.add(param)
      }
    }

    // If there's no root params, there's nothing to generate.
    if (allRootParams.size === 0) {
      return 'export {}'
    }

    // Generate a getter for each root param we found.
    const sortedRootParamNames = Array.from(allRootParams).sort()
    const content = [
      `import { getRootParam } from 'next/dist/server/request/root-params';`,
      ...sortedRootParamNames.map((paramName) => {
        return `export async function ${paramName}() { return getRootParam('${paramName}'); }`
      }),
    ].join('\n')

    return content
  }

async function findRootLayouts({
  appDir,
  pageExtensions,
  trackDirectory,
}: {
  appDir: string
  pageExtensions: string[]
  trackDirectory: ((dirPath: string) => void) | undefined
}) {
  const layoutFilenameRegex = new RegExp(
    `^layout\\.(?:${pageExtensions.join('|')})$`
  )

  async function visit(directory: string): Promise<string[]> {
    let dir: Awaited<ReturnType<(typeof fs)['readdir']>>
    try {
      dir = await fs.readdir(directory, { withFileTypes: true })
    } catch (err) {
      // If the directory was removed before we managed to read it, just ignore it.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'ENOENT'
      ) {
        return []
      }

      throw err
    }

    trackDirectory?.(directory)

    const subdirectories: string[] = []
    for (const entry of dir) {
      if (entry.isDirectory()) {
        // Directories that start with an underscore are excluded from routing, so we shouldn't look for layouts inside.
        if (entry.name[0] === '_') {
          continue
        }
        // Parallel routes cannot occur above a layout, so they can't contain a root layout.
        if (entry.name[0] === '@') {
          continue
        }

        const absolutePathname = path.join(directory, entry.name)
        subdirectories.push(absolutePathname)
      } else if (entry.isFile()) {
        if (layoutFilenameRegex.test(entry.name)) {
          // We found a root layout, so we're not going to recurse into subdirectories,
          // meaning that we can skip the rest of the entries.
          // Note that we don't need to track any of the subdirectories as dependencies --
          // changes in the subdirectories will only become relevant if this root layout is (re)moved,
          // in which case the loader will re-run, traverse deeper (because it no longer stops at this root layout)
          // and then track those directories as needed.
          const rootLayoutPath = path.join(directory, entry.name)
          return [rootLayoutPath]
        }
      }
    }

    if (subdirectories.length === 0) {
      return []
    }

    const subdirectoryRootLayouts = await Promise.all(
      subdirectories.map((subdirectory) => visit(subdirectory))
    )
    return subdirectoryRootLayouts.flat(1)
  }

  return visit(appDir)
}

function getParamsFromLayoutFilePath({
  appDir,
  layoutFilePath,
}: {
  appDir: string
  layoutFilePath: string
}) {
  const rootLayoutPath = normalizeAppPath(
    ensureLeadingSlash(path.dirname(path.relative(appDir, layoutFilePath)))
  )
  const segments = rootLayoutPath.split('/')
  const paramNames: string[] = []
  for (const segment of segments) {
    const param = getSegmentParam(segment)
    if (param !== null) {
      paramNames.push(param.param)
    }
  }
  return paramNames
}

export default rootParamsLoader
