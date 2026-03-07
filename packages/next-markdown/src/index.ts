import type React from 'react'

export {
  MARKDOWN_COMPONENT_MARKER_TAG,
  MARKDOWN_INTERACTIVE_ATTR,
  MARKDOWN_SEGMENT_MARKER_TAG,
} from './constants'
export { markReactNode } from './instrumentation'
export type {
  MarkdownComponent,
  MarkdownComponentContext,
  MarkdownComponents,
  MarkdownSegmentDefinition,
} from './types'

import {
  resolveReactNodeForMarkdown,
  sanitizeReactNodeForMarkdown,
} from './instrumentation'
import { renderReactNodeToMarkdownNodes } from './render-tree'
import { serializeMarkdownNodes } from './serialize'
import type { MarkdownComponents, MarkdownSegmentDefinition } from './types'

export async function renderReactToMarkdown(
  node: React.ReactNode,
  options: {
    rootComponents?: MarkdownComponents
    segments?: Map<string, MarkdownSegmentDefinition>
  } = {}
): Promise<string> {
  const resolvedNode = await resolveReactNodeForMarkdown(node)
  const root = renderReactNodeToMarkdownNodes(
    sanitizeReactNodeForMarkdown(resolvedNode)
  )
  return serializeMarkdownNodes(root, options)
}
