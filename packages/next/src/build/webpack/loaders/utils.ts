import type webpack from 'webpack'
import { RSC_MODULE_TYPES } from '../../../shared/lib/constants'
import { getModuleBuildInfo } from './get-module-build-info'

const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'ico', 'svg']
const imageRegex = new RegExp(`\\.(${imageExtensions.join('|')})$`)

// Determine if the whole module is client action, 'use server' in nested closure in the client module
function isActionClientLayerModule(mod: webpack.NormalModule) {
  const rscInfo = getModuleBuildInfo(mod).rsc
  return !!(rscInfo?.actionIds && rscInfo?.type === RSC_MODULE_TYPES.client)
}

export function isClientComponentEntryModule(mod: webpack.NormalModule) {
  const rscInfo = getModuleBuildInfo(mod).rsc
  const hasClientDirective = rscInfo?.isClientRef
  const isActionLayerEntry = isActionClientLayerModule(mod)
  return (
    hasClientDirective || isActionLayerEntry || imageRegex.test(mod.resource)
  )
}

export const regexCSS = /\.(css|scss|sass)(\?.*)?$/

// This function checks if a module is able to emit CSS resources. You should
// never only rely on a single regex to do that.
export function isCSSMod(mod: {
  resource: string
  type?: string
  loaders?: { loader: string }[]
}): boolean {
  return !!(
    mod.type === 'css/mini-extract' ||
    (mod.resource && regexCSS.test(mod.resource)) ||
    mod.loaders?.some(
      ({ loader }) =>
        loader.includes('next-style-loader/index.js') ||
        (process.env.NEXT_RSPACK &&
          loader.includes('rspack.CssExtractRspackPlugin.loader')) ||
        loader.includes('mini-css-extract-plugin/loader.js') ||
        loader.includes('@vanilla-extract/webpack-plugin/loader/')
    )
  )
}

export function encodeToBase64<T extends object>(obj: T): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

export function decodeFromBase64<T extends object>(str: string): T {
  return JSON.parse(Buffer.from(str, 'base64').toString('utf8'))
}

export async function getLoaderModuleNamedExports(
  resourcePath: string,
  context: webpack.LoaderContext<any>
): Promise<string[]> {
  if (process.env.NEXT_RSPACK) {
    // Currently, the loadModule method is not supported in Rspack.
    // Use getModuleNamedExports (implemented by us using SWC) to extract named exports from the module.
    const binding = require('../../swc') as typeof import('../../swc')
    return binding.getModuleNamedExports(resourcePath)
  }

  const mod = await new Promise<webpack.NormalModule>((res, rej) => {
    context.loadModule(
      resourcePath,
      (err: null | Error, _source: any, _sourceMap: any, module: any) => {
        if (err) {
          return rej(err)
        }
        res(module)
      }
    )
  })

  const exportNames =
    mod.dependencies
      ?.filter((dep) => {
        return (
          [
            'HarmonyExportImportedSpecifierDependency',
            'HarmonyExportSpecifierDependency',
          ].includes(dep.constructor.name) &&
          'name' in dep &&
          dep.name !== 'default'
        )
      })
      .map((dep: any) => {
        return dep.name
      }) || []
  return exportNames
}
