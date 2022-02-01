import { sources, webpack5 } from 'next/dist/compiled/webpack/webpack'
import { collectAssets, getEntrypointInfo } from './middleware-plugin'
import { FUNCTIONS_MANIFEST } from '../../../shared/lib/constants'

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

  constructor({
    dev,
    webServerRuntime,
  }: {
    dev: boolean
    webServerRuntime: boolean
  }) {
    this.dev = dev
    this.webServerRuntime = webServerRuntime
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
      functionsManifest.pages[info.page] = {
        runtime: 'web',
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
    const handler = (parser: any) => {
      parser.hooks.evaluate
        .for('config')
        .tap(PLUGIN_NAME, (expression: any) => {
          console.log('evaluate expression', expression)
        })

      parser.hooks.exportDeclaration
        // .for('config')
        .tap(PLUGIN_NAME, (expression: any) => {
          console.log('exportDeclaration expression', expression)
        })

      parser.hooks.export
        // .for('config')
        .tap(PLUGIN_NAME, (expression: any) => {
          console.log('export expression', expression)
        })

      parser.hooks.exportSpecifier.tap(PLUGIN_NAME, (expression: any) => {
        console.log('exportSpecifier', expression)
      })
    }

    compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (factory) => {
      factory.hooks.parser.for('javascript/auto').tap(PLUGIN_NAME, handler)
      factory.hooks.parser.for('javascript/esm').tap(PLUGIN_NAME, handler)
    })

    collectAssets(compiler, this.createAssets.bind(this), {
      dev: this.dev,
      pluginName: PLUGIN_NAME,
      webServerRuntime: this.webServerRuntime,
    })
  }
}
