import { sources, webpack5 } from 'next/dist/compiled/webpack/webpack'
import { collectAssets, getEntrypointInfo } from './middleware-plugin'
import { FUNCTIONS_MANIFEST } from '../../../shared/lib/constants'
import { findEntryModule } from './next-drop-client-page-plugin'

const PLUGIN_NAME = 'FunctionsManifestPlugin'
export interface FunctionsManifest {
  version: 1
  pages: {
    [page: string]: {
      runtime: string
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
  webServerRuntime: boolean
  pagesRuntime: Map<string, string>

  constructor({
    dev,
    webServerRuntime,
  }: {
    dev: boolean
    webServerRuntime: boolean
  }) {
    this.dev = dev
    this.webServerRuntime = webServerRuntime
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
      // TODO: use web for pages configured runtime: "web";
      // Not assign if it's nodejs runtime, project configured node version is used instead
      const runtime = this.pagesRuntime.get(page) || 'web'
      functionsManifest.pages[page] = {
        runtime,
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
          const entryModule = findEntryModule(
            parser.state.compilation,
            parser.state.module
          )
          if (!entryModule) {
            return
          }

          const { declaration } = statement
          if (exportName === 'config') {
            const varDecl = declaration.declarations[0]
            const init = varDecl.init.properties[0]
            const runtime = init.value.value

            // @ts-ignore buildInfo exists on Module
            entryModule.buildInfo.NEXT_runtime = runtime
          }
        }
      )
    }

    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation: any, { normalModuleFactory: factory }: any) => {
        factory.hooks.parser.for('javascript/auto').tap(PLUGIN_NAME, handler)
        factory.hooks.parser.for('javascript/esm').tap(PLUGIN_NAME, handler)

        compilation.hooks.seal.tap(PLUGIN_NAME, () => {
          for (const [name, entryData] of compilation.entries) {
            for (const dependency of entryData.dependencies) {
              // @ts-ignore TODO: webpack 5 types
              const module = compilation.moduleGraph.getModule(dependency)
              const runtime = module?.buildInfo?.NEXT_runtime
              this.pagesRuntime.set(name, runtime)
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
