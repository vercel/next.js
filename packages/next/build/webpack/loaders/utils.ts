import { RSC_MODULE_TYPES } from '../../../shared/lib/constants'

const nextClientComponents = ['link', 'image', 'future/image']

const NEXT_BUILT_IN_CLIENT_RSC_REGEX = new RegExp(
  `next[\\\\/](${nextClientComponents.join('|')})\\.js$`
)

export function isNextBuiltInClientComponent(resource: string) {
  return NEXT_BUILT_IN_CLIENT_RSC_REGEX.test(resource)
}

export function isClientComponentModule(mod: {
  resource: string
  buildInfo: any
}) {
  const hasClientDirective = mod.buildInfo.rsc?.type === RSC_MODULE_TYPES.client
  return isNextBuiltInClientComponent(mod.resource) || hasClientDirective
}
