import path from 'path'

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { WEBPACK_LAYERS } from '../../../lib/constants'

const PLUGIN_NAME = 'FlightTypesPlugin'

interface Options {
  dir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean
}

function createTypeGuardFile(
  fullPath: string,
  relativePath: string,
  options: {
    type: 'layout' | 'page'
  }
) {
  return `// File: ${fullPath}
import * as entry from '${relativePath}'
type TEntry = typeof entry

check<IEntry, TEntry>(entry)

type PageParams = Record<string, string>
interface PageProps {
  params?: PageParams
  searchParams?: Record<string, string | string[]>
}
interface LayoutProps {
  children: React.ReactNode
  params?: PageParams
}

type PageComponent = (props: PageProps) => React.ReactNode | Promise<React.ReactNode>
type LayoutComponent = (props: LayoutProps) => React.ReactNode | Promise<React.ReactNode>

interface IEntry {
  ${
    options.type === 'layout'
      ? `default: LayoutComponent`
      : `default: PageComponent`
  }
  config?: {}
  generateStaticParams?: (params?: PageParams) => Promise<any[]>
  revalidate?: RevalidateRange<TEntry> | false
  dynamic?: 'auto' | 'force-dynamic' | 'error' | 'force-static'
  dynamicParams?: boolean
  fetchCache?: 'auto' | 'force-no-store' | 'only-no-store' | 'default-no-store' | 'default-cache' | 'only-cache' | 'force-cache'
  preferredRegion?: 'auto' | 'home' | 'edge'
  ${options.type === 'page' ? "runtime?: 'nodejs' | 'experimental-edge'" : ''}
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

export class FlightTypesPlugin {
  dir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean

  constructor(options: Options) {
    this.dir = options.dir
    this.appDir = options.appDir
    this.dev = options.dev
    this.isEdgeServer = options.isEdgeServer
  }

  apply(compiler: webpack.Compiler) {
    const assetPrefix = this.dev ? '..' : this.isEdgeServer ? '..' : '../..'

    const handleModule = (_mod: webpack.Module, assets: any) => {
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
          path.relative(typePath, ''),
          relativePathToRoot.replace(/\.(js|jsx|ts|tsx|mjs)$/, '')
        )
        .replace(/\\/g, '/')
      const assetPath = assetPrefix + '/' + typePath.replace(/\\/g, '/')

      if (IS_LAYOUT) {
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'layout',
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
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        (assets) => {
          for (const entrypoint of compilation.entrypoints.values()) {
            for (const chunk of entrypoint.chunks) {
              compilation.chunkGraph.getChunkModules(chunk).forEach((mod) => {
                handleModule(mod, assets)
              })
            }
          }
        }
      )
    })
  }
}
