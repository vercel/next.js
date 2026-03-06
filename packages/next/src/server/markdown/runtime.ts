import type {
  MarkdownComponent,
  MarkdownComponentContext,
  MarkdownComponents,
  MarkdownSegmentDefinition,
} from '../../../../next-markdown/src'

type MarkdownRuntimeModule = typeof import('../../../../next-markdown/src')

let runtime: MarkdownRuntimeModule | null = null

function getMarkdownRuntime(): MarkdownRuntimeModule {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('Markdown output is not supported in the Edge runtime.')
  }

  if (runtime) {
    return runtime
  }

  try {
    runtime =
      require('../../../../next-markdown/src') as typeof import('../../../../next-markdown/src')
  } catch {
    runtime = require('@next/markdown') as typeof import('@next/markdown')
  }

  return runtime
}

export const MARKDOWN_COMPONENT_MARKER_TAG = 'react-markdown-component-marker'
export const MARKDOWN_INTERACTIVE_ATTR = 'data-react-markdown-interactive'
export const MARKDOWN_SEGMENT_MARKER_TAG = 'react-markdown-segment-marker'

export function markReactNode(
  ...args: Parameters<MarkdownRuntimeModule['markReactNode']>
) {
  return getMarkdownRuntime().markReactNode(...args)
}

export function renderHtmlToMarkdown(
  ...args: Parameters<MarkdownRuntimeModule['renderHtmlToMarkdown']>
) {
  return getMarkdownRuntime().renderHtmlToMarkdown(...args)
}

export type {
  MarkdownComponent,
  MarkdownComponentContext,
  MarkdownComponents,
  MarkdownSegmentDefinition,
}
