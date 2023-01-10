import type { Metadata } from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'

function resolveTitleTemplate(template: string, title: string) {
  return template.replace(/%s/g, title)
}

export function resolveTitle(
  stashed: AbsoluteTemplateString,
  title: Metadata['title']
) {
  if (typeof title === 'string') {
    stashed.absolute = resolveTitleTemplate(stashed.template, title)
  } else if (title) {
    if ('default' in title) {
      stashed.absolute = resolveTitleTemplate(stashed.template, title.default)
    }
    if ('absolute' in title) {
      stashed.absolute = resolveTitleTemplate(stashed.template, title.absolute)
    }
    if (title && 'template' in title) {
      stashed.template = title.template
    }
  }
}
