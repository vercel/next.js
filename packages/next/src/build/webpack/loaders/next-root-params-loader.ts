import type { webpack } from 'next/dist/compiled/webpack/webpack'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { ensureLeadingSlash } from '../../../shared/lib/page-path/ensure-leading-slash'
import type { DynamicParamTypes } from '../../../server/app-render/types'
import { getSegmentParam } from '../../../server/app-render/get-segment-param'
import { InvariantError } from '../../../shared/lib/invariant-error'

export type RootParamsLoaderOpts = {
  appDir: string
  pageExtensions: string[]
}

export type CollectedRootParams = Map<string, Set<DynamicParamTypes>>

const rootParamsLoader: webpack.LoaderDefinitionFunction<RootParamsLoaderOpts> =
  async function () {
    const { appDir, pageExtensions } = this.getOptions()

    const allRootParams = await collectRootParamsFromFileSystem({
      appDir: appDir,
      pageExtensions,
    })
    // invalidate the result whenever a file/directory is added/removed inside the app dir or its subdirectories,
    // because that might mean that a root layout has been moved.
    this.addContextDependency(appDir)

    // If there's no root params, there's nothing to generate.
    if (allRootParams.size === 0) {
      return 'export {}'
    }

    // Generate a getter for each root param we found.
    const sortedRootParamNames = Array.from(allRootParams.keys()).sort()
    const content = [
      `import { getRootParam } from 'next/dist/server/request/root-params';`,
      ...sortedRootParamNames.map((paramName) => {
        return `export function ${paramName}() { return getRootParam('${paramName}'); }`
      }),
    ].join('\n')

    return content
  }

export default rootParamsLoader

export async function collectRootParamsFromFileSystem(
  opts: Parameters<typeof findRootLayouts>[0]
) {
  return collectRootParams({
    appDir: opts.appDir,
    rootLayoutFilePaths: await findRootLayouts(opts),
  })
}

function collectRootParams({
  rootLayoutFilePaths,
  appDir,
}: {
  rootLayoutFilePaths: string[]
  appDir: string
}): CollectedRootParams {
  // Collect the param names and kinds from all root layouts.
  // Note that if multiple root layouts use the same param name, it can have multiple kinds.
  const allRootParams: CollectedRootParams = new Map()

  for (const rootLayoutFilePath of rootLayoutFilePaths) {
    const params = getParamsFromLayoutFilePath({
      appDir,
      layoutFilePath: rootLayoutFilePath,
    })
    for (const param of params) {
      const { param: paramName, type: paramKind } = param
      let paramKinds = allRootParams.get(paramName)
      if (!paramKinds) {
        allRootParams.set(paramName, (paramKinds = new Set()))
      }
      paramKinds.add(paramKind)
    }
  }

  return allRootParams
}

async function findRootLayouts({
  appDir,
  pageExtensions,
}: {
  appDir: string
  pageExtensions: string[]
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

export type ParamInfo = { param: string; type: DynamicParamTypes }

export function getParamsFromLayoutFilePath({
  appDir,
  layoutFilePath,
}: {
  appDir: string
  layoutFilePath: string
}): ParamInfo[] {
  const rootLayoutPath = normalizeAppPath(
    ensureLeadingSlash(path.dirname(path.relative(appDir, layoutFilePath)))
  )
  const segments = rootLayoutPath.split('/')
  const params: ParamInfo[] = []
  for (const segment of segments) {
    const param = getSegmentParam(segment)
    if (param !== null) {
      params.push(param)
    }
  }
  return params
}

//=============================================
// Type declarations
//=============================================

export function generateDeclarations(rootParams: CollectedRootParams) {
  const sortedRootParamNames = Array.from(rootParams.keys()).sort()
  const declarationLines = sortedRootParamNames
    .map((paramName) => {
      // A param can have multiple kinds (in different root layouts).
      // In that case, we'll need to union the types together together.
      const paramKinds = Array.from(rootParams.get(paramName)!)
      const possibleTypesForParam = paramKinds.map((kind) =>
        getTypescriptTypeFromParamKind(kind)
      )
      // A root param getter can be called
      // - in a route handler (not yet implemented)
      // - a server action (unsupported)
      // - in another root layout that doesn't share the same root params.
      // For this reason, we currently always want `... | undefined` in the type.
      possibleTypesForParam.push(`undefined`)

      const paramType = unionTsTypes(possibleTypesForParam)

      return [
        `  /** Allows reading the '${paramName}' root param. */`,
        `  export function ${paramName}(): Promise<${paramType}>`,
      ].join('\n')
    })
    .join('\n\n')

  return `declare module 'next/root-params' {\n${declarationLines}\n}\n`
}

function getTypescriptTypeFromParamKind(kind: DynamicParamTypes): string {
  switch (kind) {
    case 'catchall':
    case 'catchall-intercepted': {
      return `string[]`
    }
    case 'optional-catchall': {
      return `string[] | undefined`
    }
    case 'dynamic':
    case 'dynamic-intercepted': {
      return `string`
    }
    default: {
      kind satisfies never
      throw new InvariantError(`Unknown param kind ${kind}`)
    }
  }
}

function unionTsTypes(types: string[]) {
  if (types.length === 0) return 'never'
  if (types.length === 1) return types[0]
  return types.map((type) => `(${type})`).join(' | ')
}
