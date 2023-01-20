import type { Metadata } from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'

function resolveTitleTemplate(template: string | null, title: string) {
  return template ? template.replace(/%s/g, title) : title
}

export function mergeTitle<T extends { title?: Metadata['title'] }>(
  source: T,
  stashedTemplate: string | null
) {
  const { title } = source

  let resolved
  const template =
    typeof source.title !== 'string' &&
    source.title &&
    'template' in source.title
      ? source.title.template
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

  const target = source
  if (source.title && typeof source.title !== 'string') {
    const targetTitle = source.title as AbsoluteTemplateString
    targetTitle.template = template
    targetTitle.absolute = resolved || ''
  } else {
    target.title = { absolute: resolved || source.title || '', template }
  }
}
