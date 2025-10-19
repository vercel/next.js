import type {
  Issue,
  PlainTraceItem,
  StyledString,
  TurbopackResult,
} from '../../../build/swc/types'

import { bold, green, magenta, red } from '../../../lib/picocolors'
import isInternal from '../is-internal'
import {
  decodeMagicIdentifier,
  MAGIC_IDENTIFIER_REGEX,
} from '../magic-identifier'
import type { EntryKey } from './entry-key'
import * as Log from '../../../build/output/log'
import type { NextConfigComplete } from '../../../server/config-shared'

type IssueKey = `${Issue['severity']}-${Issue['filePath']}-${string}-${string}`
export type IssuesMap = Map<IssueKey, Issue>
export type EntryIssuesMap = Map<EntryKey, IssuesMap>
export type TopLevelIssuesMap = IssuesMap

/**
 * An error generated from emitted Turbopack issues. This can include build
 * errors caused by issues with user code.
 */
export class ModuleBuildError extends Error {
  name = 'ModuleBuildError'
}

/**
 * Thin stopgap workaround layer to mimic existing wellknown-errors-plugin in webpack's build
 * to emit certain type of errors into cli.
 */
export function isWellKnownError(issue: Issue): boolean {
  const { title } = issue
  const formattedTitle = renderStyledStringToErrorAnsi(title)
  // TODO: add more well known errors
  if (
    formattedTitle.includes('Module not found') ||
    formattedTitle.includes('Unknown module type')
  ) {
    return true
  }

  return false
}

export function getIssueKey(issue: Issue): IssueKey {
  return `${issue.severity}-${issue.filePath}-${JSON.stringify(
    issue.title
  )}-${JSON.stringify(issue.description)}`
}

export function processIssues(
  currentEntryIssues: EntryIssuesMap,
  key: EntryKey,
  result: TurbopackResult,
  throwIssue: boolean,
  logErrors: boolean
) {
  const newIssues = new Map<IssueKey, Issue>()
  currentEntryIssues.set(key, newIssues)

  const relevantIssues = new Set()

  for (const issue of result.issues) {
    if (
      issue.severity !== 'error' &&
      issue.severity !== 'fatal' &&
      issue.severity !== 'warning'
    )
      continue

    const issueKey = getIssueKey(issue)
    newIssues.set(issueKey, issue)

    if (issue.severity !== 'warning') {
      if (throwIssue) {
        const formatted = formatIssue(issue)
        relevantIssues.add(formatted)
      }
      // if we throw the issue it will most likely get handed and logged elsewhere
      else if (logErrors && isWellKnownError(issue)) {
        const formatted = formatIssue(issue)
        Log.error(formatted)
      }
    }
  }

  if (relevantIssues.size && throwIssue) {
    throw new ModuleBuildError([...relevantIssues].join('\n\n'))
  }
}

export function formatIssue(issue: Issue) {
  const { filePath, title, description, source, importTraces } = issue
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
    const { codeFrameColumns } =
      require('next/dist/compiled/babel/code-frame') as typeof import('next/dist/compiled/babel/code-frame')

    message +=
      codeFrameColumns(
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
        { forceColor: true }
      ).trim() + '\n\n'
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

  // TODO: make it possible to enable this for debugging, but not in tests.
  // if (detail) {
  //   message += renderStyledStringToErrorAnsi(detail) + '\n\n'
  // }

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

export function renderStyledStringToErrorAnsi(string: StyledString): string {
  function decodeMagicIdentifiers(str: string): string {
    return str.replaceAll(MAGIC_IDENTIFIER_REGEX, (ident) => {
      try {
        return magenta(`{${decodeMagicIdentifier(ident)}}`)
      } catch (e) {
        return magenta(`{${ident} (decoding failed: ${e})}`)
      }
    })
  }

  switch (string.type) {
    case 'text':
      return decodeMagicIdentifiers(string.value)
    case 'strong':
      return bold(red(decodeMagicIdentifiers(string.value)))
    case 'code':
      return green(decodeMagicIdentifiers(string.value))
    case 'line':
      return string.value.map(renderStyledStringToErrorAnsi).join('')
    case 'stack':
      return string.value.map(renderStyledStringToErrorAnsi).join('\n')
    default:
      throw new Error('Unknown StyledString type', string)
  }
}

export function isFileSystemCacheEnabledForDev(
  config: NextConfigComplete
): boolean {
  return config.experimental?.turbopackFileSystemCacheForDev || false
}

export function isFileSystemCacheEnabledForBuild(
  config: NextConfigComplete
): boolean {
  return config.experimental?.turbopackFileSystemCacheForBuild || false
}
