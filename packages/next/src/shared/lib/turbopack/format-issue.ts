import type { Issue, PlainTraceItem } from '../../../build/swc/types'

import isInternal from '../is-internal'
import { codeFrameColumns } from '../errors/code-frame'
import { renderStyledStringToErrorAnsi } from './utils'

const VERBOSE_ISSUES = !!process.env.NEXT_TURBOPACK_VERBOSE_ISSUES

export function formatIssue(issue: Issue) {
  const { filePath, title, description, detail, source, importTraces } = issue
  let { documentationLink } = issue
  const formattedTitle = renderStyledStringToErrorAnsi(title).replace(
    /\n/g,
    '\n    '
  )

  // TODO: Use error codes to identify these
  // TODO: Generalize adapting Turbopack errors to Next.js errors
  if (formattedTitle.includes('Module not found')) {
    // For compatiblity with webpack
    // TODO: include columns in webpack errors.
    documentationLink = 'https://nextjs.org/docs/messages/module-not-found'
  }

  const formattedFilePath = filePath
    .replace('[project]/', './')
    .replaceAll('/./', '/')
    .replace('\\\\?\\', '')

  let message = ''

  if (source?.range) {
    const { start } = source.range
    message = `${formattedFilePath}:${start.line + 1}:${
      start.column + 1
    }\n${formattedTitle}`
  } else if (formattedFilePath) {
    message = `${formattedFilePath}\n${formattedTitle}`
  } else {
    message = formattedTitle
  }
  message += '\n'

  if (
    source?.range &&
    source.source.content &&
    // ignore Next.js/React internals, as these can often be huge bundled files.
    !isInternal(filePath)
  ) {
    const { start, end } = source.range

    // TODO(lukesandberg): move codeFrame formatting into turbopack, it would be more efficient than passing the source back and forth
    const frame = codeFrameColumns(
      source.source.content,
      {
        start: {
          line: start.line + 1,
          column: start.column + 1,
        },
        end: {
          line: end.line + 1,
          column: end.column + 1,
        },
      },
      { color: true }
    )
    if (frame) {
      message += frame.trimEnd() + '\n\n'
    }
  }

  if (description) {
    if (
      description.type === 'text' &&
      description.value.includes(`Cannot find module 'sass'`)
    ) {
      message +=
        "To use Next.js' built-in Sass support, you first need to install `sass`.\n"
      message += 'Run `npm i sass` or `yarn add sass` inside your workspace.\n'
      message += '\nLearn more: https://nextjs.org/docs/messages/install-sass\n'
    } else {
      message += renderStyledStringToErrorAnsi(description) + '\n\n'
    }
  }

  // TODO: make it easier to enable this for debugging
  if (VERBOSE_ISSUES && detail) {
    message += renderStyledStringToErrorAnsi(detail) + '\n\n'
  }

  if (importTraces?.length) {
    // This is the same logic as in turbopack/crates/turbopack-cli-utils/src/issue.rs
    // We end up with multiple traces when the file with the error is reachable from multiple
    // different entry points (e.g. ssr, client)
    message += `Import trace${importTraces.length > 1 ? 's' : ''}:\n`
    const everyTraceHasADistinctRootLayer =
      new Set(importTraces.map(leafLayerName).filter((l) => l != null)).size ===
      importTraces.length
    for (let i = 0; i < importTraces.length; i++) {
      const trace = importTraces[i]
      const layer = leafLayerName(trace)
      let traceIndent = '    '
      // If this is true, layer must be present
      if (everyTraceHasADistinctRootLayer) {
        message += `  ${layer}:\n`
      } else {
        if (importTraces.length > 1) {
          // Otherwise use simple 1 based indices to disambiguate
          message += `  #${i + 1}`
          if (layer) {
            message += ` [${layer}]`
          }
          message += ':\n'
        } else if (layer) {
          message += ` [${layer}]:\n`
        } else {
          // If there is a single trace and no layer name just don't indent it.
          traceIndent = '  '
        }
      }
      message += formatIssueTrace(trace, traceIndent, !identicalLayers(trace))
    }
  }
  if (documentationLink) {
    message += documentationLink + '\n\n'
  }
  return message
}

/** Returns the first present layer name in the trace */
function leafLayerName(items: PlainTraceItem[]): string | undefined {
  for (const item of items) {
    const layer = item.layer
    if (layer != null) return layer
  }
  return undefined
}

/**
 * Returns whether or not all items share the same layer.
 * If a layer is absent we ignore it in this analysis
 */
function identicalLayers(items: PlainTraceItem[]): boolean {
  const firstPresentLayer = items.findIndex((t) => t.layer != null)
  if (firstPresentLayer === -1) return true // all layers are absent
  const layer = items[firstPresentLayer].layer
  for (let i = firstPresentLayer + 1; i < items.length; i++) {
    const itemLayer = items[i].layer
    if (itemLayer == null || itemLayer !== layer) {
      return false
    }
  }
  return true
}

function formatIssueTrace(
  items: PlainTraceItem[],
  indent: string,
  printLayers: boolean
): string {
  return `${items
    .map((item) => {
      let r = indent
      if (item.fsName !== 'project') {
        r += `[${item.fsName}]/`
      } else {
        // This is consistent with webpack's output
        r += './'
      }
      r += item.path
      if (printLayers && item.layer) {
        r += ` [${item.layer}]`
      }
      return r
    })
    .join('\n')}\n\n`
}

export function isRelevantWarning(issue: Issue): boolean {
  return issue.severity === 'warning' && !isNodeModulesIssue(issue)
}

function isNodeModulesIssue(issue: Issue): boolean {
  if (issue.severity === 'warning' && issue.stage === 'config') {
    // Override for the externalize issue
    // `Package foo (serverExternalPackages or default list) can't be external`
    if (
      renderStyledStringToErrorAnsi(issue.title).includes("can't be external")
    ) {
      return false
    }
  }

  return (
    issue.severity === 'warning' &&
    (issue.filePath.match(/^(?:.*[\\/])?node_modules(?:[\\/].*)?$/) !== null ||
      // Ignore Next.js itself when running next directly in the monorepo where it is not inside
      // node_modules anyway.
      // TODO(mischnic) prevent matches when this is published to npm
      issue.filePath.startsWith('[project]/packages/next/'))
  )
}
