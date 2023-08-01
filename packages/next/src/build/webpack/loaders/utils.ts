import { createHash } from 'crypto'
import { RSC_MODULE_TYPES } from '../../../shared/lib/constants'

const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'ico', 'svg']
const imageRegex = new RegExp(`\\.(${imageExtensions.join('|')})$`)

export function isClientComponentEntryModule(mod: {
  resource: string
  buildInfo?: any
}) {
  const rscInfo = mod.buildInfo.rsc
  const hasClientDirective = rscInfo?.isClientRef
  const isActionLayerEntry =
    rscInfo?.actions && rscInfo?.type === RSC_MODULE_TYPES.client
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
        loader.includes('mini-css-extract-plugin/loader.js') ||
        loader.includes('@vanilla-extract/webpack-plugin/loader/')
    )
  )
}

export function getActions(mod: {
  resource: string
  buildInfo?: any
}): undefined | string[] {
  return mod.buildInfo?.rsc?.actions
}

export function generateActionId(filePath: string, exportName: string) {
  return createHash('sha1')
    .update(filePath + ':' + exportName)
    .digest('hex')
}

export function encodeToBase64<T extends {}>(obj: T): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

export function decodeFromBase64<T extends {}>(str: string): T {
  return JSON.parse(Buffer.from(str, 'base64').toString('utf8'))
}
