import type { Metadata } from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'

function resolveTitleTemplate(template: string, title: string) {
  return template.replace(/%s/g, title)
}

export function resolveTitle(
  stashed: AbsoluteTemplateString,
  title: Metadata['title']
) {
  const resolved: AbsoluteTemplateString = { ...stashed }
  if (typeof title === 'string') {
    resolved.absolute = resolveTitleTemplate(stashed.template, title)
  } else if (title) {
    if ('default' in title) {
      resolved.absolute = resolveTitleTemplate(stashed.template, title.default)
    }
    if ('absolute' in title) {
      resolved.absolute = title.absolute
    }
    if (title && 'template' in title) {
      resolved.template = title.template
    }
  }
  return resolved
}
