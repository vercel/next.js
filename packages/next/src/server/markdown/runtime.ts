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

  let loaded: MarkdownRuntimeModule
  // eslint-disable-next-line no-eval -- Deferred so the packaged build doesn't try to bundle the local workspace source path.
  const dynamicRequire = eval('require') as NodeJS.Require

  const fs = dynamicRequire('node:fs') as typeof import('node:fs')

  const path = dynamicRequire('node:path') as typeof import('node:path')

  const candidates = [
    path.resolve(__dirname, '../../../../next-markdown/dist'),
    path.resolve(__dirname, '../../../../../next-markdown/dist'),
  ]

  for (const candidate of candidates) {
    if (
      fs.existsSync(`${candidate}.js`) ||
      fs.existsSync(path.join(candidate, 'index.js'))
    ) {
      loaded = dynamicRequire(candidate) as MarkdownRuntimeModule
      runtime = loaded
      return loaded
    }
  }

  const packageName = '@next/markdown'
  loaded = dynamicRequire(packageName) as MarkdownRuntimeModule

  runtime = loaded
  return loaded
}

export const MARKDOWN_COMPONENT_MARKER_TAG = 'react-markdown-component-marker'
export const MARKDOWN_INTERACTIVE_ATTR = 'data-react-markdown-interactive'
export const MARKDOWN_SEGMENT_MARKER_TAG = 'react-markdown-segment-marker'

export function markReactNode(
  ...args: Parameters<MarkdownRuntimeModule['markReactNode']>
) {
  return getMarkdownRuntime().markReactNode(...args)
}

export function renderReactToMarkdown(
  ...args: Parameters<MarkdownRuntimeModule['renderReactToMarkdown']>
) {
  return getMarkdownRuntime().renderReactToMarkdown(...args)
}

export type {
  MarkdownComponent,
  MarkdownComponentContext,
  MarkdownComponents,
  MarkdownSegmentDefinition,
}
