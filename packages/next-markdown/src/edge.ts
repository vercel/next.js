import type React from 'react'

export {
  MARKDOWN_COMPONENT_MARKER_TAG,
  MARKDOWN_INTERACTIVE_ATTR,
  MARKDOWN_SEGMENT_MARKER_TAG,
} from './constants'

export function markReactNode(node: React.ReactNode): React.ReactNode {
  return node
}

export async function renderReactToMarkdown(): Promise<string> {
  throw new Error('Markdown output is not supported in the Edge runtime.')
}

export type {
  MarkdownComponent,
  MarkdownComponentContext,
  MarkdownComponents,
  MarkdownSegmentDefinition,
} from './types'
