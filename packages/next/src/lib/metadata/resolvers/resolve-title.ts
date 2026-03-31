import type { Metadata } from '../types/metadata-interface'
import type { AbsoluteTemplateString } from '../types/metadata-types'

function resolveTitleTemplate(
  template: string | null | undefined,
  title: string
) {
  return template ? template.replace(/%s/g, title) : title
}

export function resolveTitle(
  title: Metadata['title'],
  stashedTemplate: string | null | undefined
): AbsoluteTemplateString {
  let resolved
  const template =
    typeof title !== 'string' && title && 'template' in title
      ? title.template
      : null

  if (typeof title === 'string') {
    resolved = resolveTitleTemplate(stashedTemplate, title)
  } else if (title) {
    if ('default' in title) {
      resolved = resolveTitleTemplate(stashedTemplate, title.default)
    }
    if ('absolute' in title && title.absolute) {
      resolved = title.absolute
    }
  }

  if (title && typeof title !== 'string') {
    return {
      template,
      absolute: resolved || '',
    }
  } else {
    return { absolute: resolved || title || '', template }
  }
}
