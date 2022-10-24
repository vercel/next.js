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
