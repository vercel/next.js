import path from 'path'

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { WEBPACK_LAYERS } from '../../../lib/constants'

const PLUGIN_NAME = 'FlightTypesPlugin'

interface Options {
  appDir: string
  dev: boolean
}

export class FlightTypesPlugin {
  appDir: string
  dev: boolean

  constructor(options: Options) {
    this.appDir = options.appDir
    this.dev = options.dev
  }

  apply(compiler: webpack.Compiler) {
    const handleModule = (mod: webpack.NormalModule, assets: any) => {
      if (mod.layer !== WEBPACK_LAYERS.server) return
      if (!mod.resource) return
      if (!mod.resource.startsWith(this.appDir + path.sep)) return
      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(mod.resource)) return

      const IS_LAYOUT = /[/\\]layout\.[^\.]+$/.test(mod.resource)
      const IS_PAGE = !IS_LAYOUT && /[/\\]page\.[^\.]+$/.test(mod.resource)
      const relativePath = path.relative(this.appDir, mod.resource)

      // const RSC = mod.buildInfo.rsc

      const typePath = path.join(
        'types',
        'app',
        relativePath.replace(/\.(js|jsx|ts|tsx|mjs)$/, '.ts')
      )
      const relativeImportPath = path.join(
        path.relative(typePath, ''),
        'app',
        relativePath.replace(/\.(js|jsx|ts|tsx|mjs)$/, '')
      )
      const assetPath = path.join(
        this.dev ? '..' : path.join('..', '..'),
        typePath
      )

      if (IS_LAYOUT) {
        assets[assetPath] = new sources.RawSource(`
import * as Self from '${relativeImportPath}'

type Impossible<K extends keyof any> = {
  [P in K]: never;
};

function check<Base, T extends Base>(_mod: T & Impossible<Exclude<keyof T, keyof Base>>): void {}

check<Layout, typeof Self>(Self)

interface Layout {
  default:({ children }: { children: any; }) => JSX.Element
  config?: {
    revalidate?: number;
  }
}`) as unknown as webpack.sources.RawSource
      } else if (IS_PAGE) {
        assets[assetPath] = new sources.RawSource(`
import * as Self from '${relativeImportPath}'

type Impossible<K extends keyof any> = {
  [P in K]: never;
};

function check<Base, T extends Base>(_mod: T & Impossible<Exclude<keyof T, keyof Base>>): void {}

check<Page, typeof Self>(Self)

interface Page {
  default:() => JSX.Element
  config?: {
    revalidate?: number;
    runtime?: 'nodejs' | 'experimental-edge';
  }
}
`) as unknown as webpack.sources.RawSource
      }
    }

    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        (assets) => {
          compilation.chunkGroups.forEach((chunkGroup) => {
            chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
              const chunkModules =
                compilation.chunkGraph.getChunkModulesIterable(
                  chunk
                  // TODO: Update type so that it doesn't have to be cast.
                ) as Iterable<webpack.NormalModule>
              for (const mod of chunkModules) {
                handleModule(mod, assets)

                const anyModule = mod as any
                if (anyModule.modules) {
                  anyModule.modules.forEach((concatenatedMod: any) => {
                    handleModule(concatenatedMod, assets)
                  })
                }
              }
            })
          })
        }
      )
    })
  }
}
