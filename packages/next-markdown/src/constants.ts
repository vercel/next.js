export const MARKDOWN_COMPONENT_MARKER_TAG = 'react-markdown-component-marker'
export const MARKDOWN_SEGMENT_MARKER_TAG = 'react-markdown-segment-marker'
export const MARKDOWN_INTERACTIVE_ATTR = 'data-react-markdown-interactive'

export const MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PROP =
  '__nextMarkdownBehavior'

export const MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_OMIT = 'omit'
export const MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PASSTHROUGH = 'passthrough'

export type MarkdownInternalComponentBehavior =
  | typeof MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_OMIT
  | typeof MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PASSTHROUGH

export function getMarkdownInternalComponentBehavior(
  props: Record<string, unknown>
): MarkdownInternalComponentBehavior | undefined {
  const behavior = props[MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PROP]
  if (
    behavior === MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_OMIT ||
    behavior === MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PASSTHROUGH
  ) {
    return behavior
  }

  return undefined
}
