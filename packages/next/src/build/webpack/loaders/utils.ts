import { createHash } from 'crypto'

import { RSC_MODULE_TYPES } from '../../../shared/lib/constants'

const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif']
const imageRegex = new RegExp(`\\.(${imageExtensions.join('|')})$`)

export function isClientComponentModule(mod: {
  resource: string
  buildInfo: any
}) {
  const hasClientDirective = mod.buildInfo.rsc?.type === RSC_MODULE_TYPES.client
  return hasClientDirective || imageRegex.test(mod.resource)
}

export const regexCSS = /\.(css|scss|sass)(\?.*)?$/

export function getActions(mod: {
  resource: string
  buildInfo: any
}): undefined | string[] {
  return mod.buildInfo.rsc?.actions
}

export function generateActionId(filePath: string, exportName: string) {
  return createHash('sha1')
    .update(filePath + ':' + exportName)
    .digest('hex')
}
