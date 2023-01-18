import type { Metadata } from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'

function resolveTitleTemplate(template: string | null, title: string) {
  return template ? template.replace(/%s/g, title) : title
}

export function resolveTitle(
  stashedTemplate: string | null,
  title: Metadata['title']
) {
  const resolved: AbsoluteTemplateString = {
    absolute: '',
    template: null,
  }
  if (typeof title === 'string') {
    resolved.absolute = resolveTitleTemplate(stashedTemplate, title)
  } else if (title) {
    if ('default' in title) {
      resolved.absolute = resolveTitleTemplate(stashedTemplate, title.default)
    }
    if ('absolute' in title) {
      resolved.absolute = title.absolute
    }
    if ('template' in title) {
      resolved.template = title.template
    }
  }
  return resolved
}
