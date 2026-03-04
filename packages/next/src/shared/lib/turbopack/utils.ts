import type {
  Issue,
  StyledString,
  TurbopackResult,
} from '../../../build/swc/types'

import { bold, green, magenta, red } from '../../../lib/picocolors'
import { deobfuscateText } from '../magic-identifier'
import type { EntryKey } from './entry-key'
import { formatIssue } from './format-issue'
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

export function renderStyledStringToErrorAnsi(string: StyledString): string {
  function applyDeobfuscation(str: string): string {
    // Use shared deobfuscate function and apply magenta color to identifiers
    const deobfuscated = deobfuscateText(str)
    // Color any {...} wrapped identifiers with magenta
    return deobfuscated.replace(/\{([^}]+)\}/g, (match) => magenta(match))
  }

  switch (string.type) {
    case 'text':
      return applyDeobfuscation(string.value)
    case 'strong':
      return bold(red(applyDeobfuscation(string.value)))
    case 'code':
      return green(applyDeobfuscation(string.value))
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
