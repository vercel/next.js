import type React from 'react'

export const MARKDOWN_COMPONENT_MARKER_TAG = 'react-markdown-component-marker'
export const MARKDOWN_SEGMENT_MARKER_TAG = 'react-markdown-segment-marker'
export const MARKDOWN_INTERACTIVE_ATTR = 'data-react-markdown-interactive'

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
} from './index'
