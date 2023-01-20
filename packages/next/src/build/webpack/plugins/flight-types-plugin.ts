import path from 'path'
import { promises as fs } from 'fs'

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { WEBPACK_LAYERS } from '../../../lib/constants'

const PLUGIN_NAME = 'FlightTypesPlugin'

interface Options {
  dir: string
  distDir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean
}

function createTypeGuardFile(
  fullPath: string,
  relativePath: string,
  options: {
    type: 'layout' | 'page'
    slots?: string[]
  }
) {
  return `// File: ${fullPath}
import * as entry from '${relativePath}'
type TEntry = typeof entry

check<IEntry, TEntry>(entry)

type PageParams = Record<string, string>
interface PageProps {
  params: any
  searchParams?: any
}
interface LayoutProps {
  children: React.ReactNode
${
  options.slots
    ? options.slots.map((slot) => `  ${slot}: React.ReactNode`).join('\n')
    : ''
}
  params: any
}

export type PageComponent = (props: PageProps) => React.ReactNode | Promise<React.ReactNode>
export type LayoutComponent = (props: LayoutProps) => React.ReactNode | Promise<React.ReactNode>

interface IEntry {
  ${
    options.type === 'layout'
      ? `default: LayoutComponent`
      : `default: PageComponent`
  }
  config?: {}
  generateStaticParams?: (params?: PageParams) => any[] | Promise<any[]>
  revalidate?: RevalidateRange<TEntry> | false
  dynamic?: 'auto' | 'force-dynamic' | 'error' | 'force-static'
  dynamicParams?: boolean
  fetchCache?: 'auto' | 'force-no-store' | 'only-no-store' | 'default-no-store' | 'default-cache' | 'only-cache' | 'force-cache'
  preferredRegion?: 'auto' | 'home' | 'edge'
  ${
    options.type === 'page'
      ? "runtime?: 'nodejs' | 'experimental-edge' | 'edge'"
      : ''
  }
  metadata?: any
}

// =============
// Utility types
type RevalidateRange<T> = T extends { revalidate: any } ? NonNegative<T['revalidate']> : never
type Impossible<K extends keyof any> = { [P in K]: never }
function check<Base, T extends Base>(_mod: T & Impossible<Exclude<keyof T, keyof Base>>): void {}

// https://github.com/sindresorhus/type-fest
type Numeric = number | bigint
type Zero = 0 | 0n
type Negative<T extends Numeric> = T extends Zero ? never : \`\${T}\` extends \`-\${string}\` ? T : never
type NonNegative<T extends Numeric> = T extends Zero ? T : Negative<T> extends never ? T : '__invalid_negative_number__'
`
}

async function collectNamedSlots(layoutPath: string) {
  const layoutDir = path.dirname(layoutPath)
  const items = await fs.readdir(layoutDir, { withFileTypes: true })
  const slots = []
  for (const item of items) {
    if (item.isDirectory() && item.name.startsWith('@')) {
      slots.push(item.name.slice(1))
    }
  }
  return slots
}

export class FlightTypesPlugin {
  dir: string
  distDir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean

  constructor(options: Options) {
    this.dir = options.dir
    this.distDir = options.distDir
    this.appDir = options.appDir
    this.dev = options.dev
    this.isEdgeServer = options.isEdgeServer
  }

  apply(compiler: webpack.Compiler) {
    // From dist root to project root
    const distDirRelative = path.relative(this.distDir + '/..', '.')

    // From asset root to dist root
    const assetDirRelative = this.dev
      ? '..'
      : this.isEdgeServer
      ? '..'
      : '../..'

    const handleModule = async (_mod: webpack.Module, assets: any) => {
      if (_mod.layer !== WEBPACK_LAYERS.server) return
      const mod: webpack.NormalModule = _mod as any

      if (!mod.resource) return
      if (!mod.resource.startsWith(this.appDir + path.sep)) return
      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(mod.resource)) return

      const IS_LAYOUT = /[/\\]layout\.[^./\\]+$/.test(mod.resource)
      const IS_PAGE = !IS_LAYOUT && /[/\\]page\.[^.]+$/.test(mod.resource)
      const relativePathToApp = path.relative(this.appDir, mod.resource)
      const relativePathToRoot = path.relative(this.dir, mod.resource)

      const typePath = path.join(
        'types',
        'app',
        relativePathToApp.replace(/\.(js|jsx|ts|tsx|mjs)$/, '.ts')
      )
      const relativeImportPath = path
        .join(
          distDirRelative,
          path.relative(typePath, ''),
          relativePathToRoot.replace(/\.(js|jsx|ts|tsx|mjs)$/, '')
        )
        .replace(/\\/g, '/')
      const assetPath = assetDirRelative + '/' + typePath.replace(/\\/g, '/')

      if (IS_LAYOUT) {
        const slots = await collectNamedSlots(mod.resource)
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'layout',
            slots,
          })
        ) as unknown as webpack.sources.RawSource
      } else if (IS_PAGE) {
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'page',
          })
        ) as unknown as webpack.sources.RawSource
      }
    }

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        async (assets, callback) => {
          const promises: Promise<any>[] = []
          for (const entrypoint of compilation.entrypoints.values()) {
            for (const chunk of entrypoint.chunks) {
              compilation.chunkGraph.getChunkModules(chunk).forEach((mod) => {
                promises.push(handleModule(mod, assets))
              })
            }
          }
          await Promise.all(promises)
          callback()
        }
      )
    })
  }
}
