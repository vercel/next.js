import { sources, webpack5 } from 'next/dist/compiled/webpack/webpack'
import { normalizePagePath } from '../../../server/normalize-page-path'
import { FUNCTIONS_MANIFEST } from '../../../shared/lib/constants'
import { getPageFromPath } from '../../entries'
import { collectAssets, getEntrypointInfo } from './middleware-plugin'

const PLUGIN_NAME = 'FunctionsManifestPlugin'
export interface FunctionsManifest {
  version: 1
  pages: {
    [page: string]: {
      runtime?: string
      env: string[]
      files: string[]
      name: string
      page: string
      regexp: string
    }
  }
}

export default class FunctionsManifestPlugin {
  dev: boolean
  pagesDir: string
  pageExtensions: string[]
  webServerRuntime: boolean
  pagesRuntime: Map<string, string>

  constructor({
    dev,
    pagesDir,
    pageExtensions,
    webServerRuntime,
  }: {
    dev: boolean
    pagesDir: string
    pageExtensions: string[]
    webServerRuntime: boolean
  }) {
    this.dev = dev
    this.pagesDir = pagesDir
    this.webServerRuntime = webServerRuntime
    this.pageExtensions = pageExtensions
    this.pagesRuntime = new Map()
  }

  createAssets(
    compilation: webpack5.Compilation,
    assets: any,
    envPerRoute: Map<string, string[]>,
    webServerRuntime: boolean
  ) {
    const functionsManifest: FunctionsManifest = {
      version: 1,
      pages: {},
    }

    const infos = getEntrypointInfo(compilation, envPerRoute, webServerRuntime)
    infos.forEach((info) => {
      const { page } = info
      // TODO: use global default runtime instead of 'web'
      const pageRuntime = this.pagesRuntime.get(page)
      const isWebRuntime =
        pageRuntime === 'edge' || (this.webServerRuntime && !pageRuntime)
      functionsManifest.pages[page] = {
        // Not assign if it's nodejs runtime, project configured node version is used instead
        ...(isWebRuntime && { runtime: 'web' }),
        ...info,
      }
    })

    const assetPath =
      (this.webServerRuntime ? '' : 'server/') + FUNCTIONS_MANIFEST
    assets[assetPath] = new sources.RawSource(
      JSON.stringify(functionsManifest, null, 2)
    )
  }

  apply(compiler: webpack5.Compiler) {
    const handler = (parser: webpack5.javascript.JavascriptParser) => {
      parser.hooks.exportSpecifier.tap(
        PLUGIN_NAME,
        (statement: any, _identifierName: string, exportName: string) => {
          const { declaration } = statement
          if (exportName === 'config') {
            const varDecl = declaration.declarations[0]
            const { properties } = varDecl.init
            if (!properties) return
            const prop = properties.find(
              (prop: any) => prop.key.name === 'runtime'
            )
            if (!prop) return
            const runtime = prop.value.value
            if (!['nodejs', 'edge'].includes(runtime))
              throw new Error(
                `The runtime option can only be 'nodejs' or 'edge'`
              )

            // @ts-ignore buildInfo exists on Module
            parser.state.module.buildInfo.NEXT_runtime = runtime
          }
        }
      )
    }

    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (
        compilation: webpack5.Compilation,
        { normalModuleFactory: factory }: any
      ) => {
        factory.hooks.parser.for('javascript/auto').tap(PLUGIN_NAME, handler)
        factory.hooks.parser.for('javascript/esm').tap(PLUGIN_NAME, handler)

        compilation.hooks.seal.tap(PLUGIN_NAME, () => {
          for (const entryData of compilation.entries.values()) {
            for (const dependency of entryData.dependencies) {
              // @ts-ignore TODO: webpack 5 types
              const module = compilation.moduleGraph.getModule(dependency)
              const outgoingConnections =
                compilation.moduleGraph.getOutgoingConnectionsByModule(module)
              if (!outgoingConnections) return
              const entryModules = outgoingConnections.keys()
              for (const mod of entryModules) {
                const runtime = mod?.buildInfo?.NEXT_runtime
                if (runtime) {
                  // @ts-ignore: TODO: webpack 5 types
                  const normalizedPagePath = normalizePagePath(mod.userRequest)
                  const pagePath = normalizedPagePath.replace(this.pagesDir, '')
                  const page = getPageFromPath(pagePath, this.pageExtensions)
                  this.pagesRuntime.set(page, runtime)
                  break
                }
              }
            }
          }
        })
      }
    )

    collectAssets(compiler, this.createAssets.bind(this), {
      dev: this.dev,
      pluginName: PLUGIN_NAME,
      webServerRuntime: this.webServerRuntime,
    })
  }
}
