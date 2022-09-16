import { RSC_MODULE_TYPES } from '../../../shared/lib/constants'

const nextClientComponents = ['link', 'image', 'future/image']
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif']
const imageRegex = new RegExp(`\\.(${imageExtensions.join('|')})$`)

const NEXT_API_CLIENT_RSC_REGEX = new RegExp(
  `next[\\\\/]dist[\\\\/]client[\\\\/](${nextClientComponents.join('|')})\\.js$`
)

// Cover resource paths like `next/*` and `next/dist/client/*`
export function isNextBuiltInClientComponent(resource: string) {
  return NEXT_API_CLIENT_RSC_REGEX.test(resource)
}

export function isClientComponentModule(mod: {
  resource: string
  buildInfo: any
}) {
  const hasClientDirective = mod.buildInfo.rsc?.type === RSC_MODULE_TYPES.client
  return (
    isNextBuiltInClientComponent(mod.resource) ||
    hasClientDirective ||
    imageRegex.test(mod.resource)
  )
}
