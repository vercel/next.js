import type { ResolvedMetadataWithURLs } from '../types/metadata-interface'
import type { Icon, IconDescriptor } from '../types/metadata-types'
import type { FieldResolver } from '../types/resolvers'
import { resolveAsArrayOrUndefined } from '../generate/utils'
import { isStringOrURL } from './resolve-url'
import { IconKeys } from '../constants'

export function resolveIcon(icon: Icon): IconDescriptor {
  if (isStringOrURL(icon)) return { url: icon }
  else if (Array.isArray(icon)) return icon
  return icon
}

export const resolveIcons: FieldResolver<'icons'> = (icons) => {
  if (!icons) {
    return null
  }

  const resolved: ResolvedMetadataWithURLs['icons'] = {
    icon: [],
    apple: [],
  }
  if (Array.isArray(icons)) {
    resolved.icon = icons.map(resolveIcon).filter(Boolean)
  } else if (isStringOrURL(icons)) {
    resolved.icon = [resolveIcon(icons)]
  } else {
    for (const key of IconKeys) {
      const values = resolveAsArrayOrUndefined(icons[key])
      if (values) resolved[key] = values.map(resolveIcon)
    }
  }
  return resolved
}
