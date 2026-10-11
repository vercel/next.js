/*!
 * Portions of the terminal formatting are adapted from Vitest.
 * https://github.com/vitest-dev/vitest/blob/0780a8e5b7967a4168173599e9c74fb79aab2483/packages/vitest/src/node/reporters/base.ts
 * https://github.com/vitest-dev/vitest/blob/0780a8e5b7967a4168173599e9c74fb79aab2483/packages/vitest/src/node/reporters/render-utils.ts
 *
 * MIT License
 *
 * Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { isAbsolute, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import type {
  CaseResult,
  FileResult,
  ResultCounts,
  ResultEvent,
  ResultScope,
  ResultStatus,
  RunSummary,
  SerializedDiagnostic,
  SourceLocation,
} from './events'

export interface TestReporterOptions {
  write: (text: string) => void
  writeError?: (text: string) => void
  projectDir?: string
  version?: string
  watch?: boolean
  rerun?: boolean
  color?: boolean
  isTTY?: boolean
  columns?: number
  fileCount?: number
}

function badge(
  label: string,
  background: number,
  color: boolean,
  black = true
): string {
  const text = ` ${label} `
  if (!color) return text
  return black
    ? `\x1b[1m\x1b[30m\x1b[${background}m${text}\x1b[49m\x1b[39m\x1b[22m`
    : `\x1b[${background}m\x1b[1m${text}\x1b[22m\x1b[49m`
}

export function formatWatchStatus(
  status: 'passed' | 'failed',
  color = false
): string {
  const label = status === 'passed' ? 'PASS' : 'FAIL'
  const message =
    status === 'passed'
      ? 'Waiting for file changes...'
      : 'Tests failed. Watching for file changes...'
  return `${badge(label, status === 'passed' ? 42 : 41, color)} ${color ? `\x1b[${status === 'passed' ? 32 : 31}m${message}\x1b[39m` : message}\n`
}

function counts(): ResultCounts {
  return { passed: 0, failed: 0, skipped: 0, cancelled: 0 }
}

function locationText(location: SourceLocation): string {
  return `${location.file}${location.line === undefined ? '' : `:${location.line}${location.column === undefined ? '' : `:${location.column}`}`}`
}

/** Locations are supplied by the producer using its exact compiled revision. */
export function formatDiagnostic(
  diagnostic: SerializedDiagnostic,
  projectDir?: string
): string {
  function formatLocation(location: SourceLocation): string {
    let file = location.file
    if (projectDir) {
      try {
        const path = file.startsWith('file:') ? fileURLToPath(file) : file
        if (isAbsolute(path)) {
          const local = relative(projectDir, path)
          if (
            local !== '..' &&
            !local.startsWith(`..${sep}`) &&
            !isAbsolute(local)
          )
            file = local.replace(/\\/g, '/')
        }
      } catch {
        // Keep producer attribution intact for non-file URLs and invalid paths.
      }
    }
    return locationText({ ...location, file })
  }
  const heading = `${diagnostic.name ?? (diagnostic.severity === 'warning' ? 'Warning' : 'Error')}: ${diagnostic.message}`
  const lines = [heading]
  if (diagnostic.diff) lines.push('', diagnostic.diff)
  if (diagnostic.location)
    lines.push(` ❯ ${formatLocation(diagnostic.location)}`)
  if (diagnostic.frames?.length) {
    for (const frame of diagnostic.frames) {
      if (projectDir && frame.ignored) continue
      lines.push(
        ` ❯ ${frame.methodName ? `${frame.methodName} ` : ''}${formatLocation(frame)}${frame.original === false ? ' [generated]' : ''}`
      )
      if (frame.original && frame.codeFrame) lines.push(frame.codeFrame)
    }
  } else if (diagnostic.stack) {
    // Error.stack normally repeats its name/message before the call frames.
    lines.push(
      diagnostic.stack.startsWith(`${heading}\n`)
        ? diagnostic.stack.slice(heading.length + 1)
        : diagnostic.stack
    )
  }
  for (const error of diagnostic.errors ?? []) {
    lines.push(`Aggregate error: ${formatDiagnostic(error, projectDir)}`)
  }
  if (diagnostic.cause)
    lines.push(`Caused by: ${formatDiagnostic(diagnostic.cause, projectDir)}`)
  return lines.join('\n')
}

function formatDuration(duration: number): string {
  return duration > 1000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${Math.round(duration)}ms`
}

/** One consumer per run. It never owns execution, retries, or artifact files. */
export function createTestReporter(options: TestReporterOptions) {
  let runId: string | undefined
  let startedAt: number | undefined
  let ended: Extract<ResultEvent, { type: 'run-end' }> | undefined
  const events: ResultEvent[] = []
  const entries = new Map<
    string,
    Extract<ResultEvent, { type: 'file-start' }>
  >()
  const files = new Map<string, FileResult>()
  const cases = new Map<string, CaseResult>()
  const attempts = new Map<string, CaseResult>()
  const caseNames = new Map<string, string>()
  const activeAttempts = new Set<string>()
  const diagnostics: Extract<ResultEvent, { type: 'diagnostic' }>[] = []
  let diagnosticErrors = 0
  let warnings = 0
  let attachments = 0
  const projectDir = options.projectDir ?? process.cwd()
  const color = options.color ?? false
  const columns = Number.isFinite(options.columns)
    ? Math.max(0, Math.floor(options.columns!))
    : 30
  const paint = (code: number, value: string) =>
    color ? `\x1b[${code}m${value}\x1b[0m` : value
  const write = (text: string) =>
    options.write(color ? text : stripVTControlCharacters(text))
  const writeError = (text: string) =>
    (options.writeError ?? options.write)(
      color ? text : stripVTControlCharacters(text)
    )
  const statusColor = (status: ResultStatus) =>
    status === 'failed' ? 31 : status === 'passed' ? 32 : 33
  const symbol = (status: ResultStatus, file = false) =>
    paint(
      statusColor(status),
      status === 'passed' ? '✓' : status === 'failed' ? (file ? '❯' : '×') : '↓'
    )

  function caseKey(event: { entryId: string; caseId: string }) {
    return JSON.stringify([event.entryId, event.caseId])
  }

  function attemptKey(event: {
    entryId: string
    caseId: string
    attempt: { id: string }
  }) {
    return JSON.stringify([event.entryId, event.caseId, event.attempt.id])
  }

  function fileLabel(entryId?: string): string {
    const entry = entryId ? entries.get(entryId)?.entry : undefined
    if (!entry) return 'unknown test'
    const profile = entry.profile.id
    let profileBadge = `|${profile}|`
    if (color) {
      const index = [...profile].reduce(
        (sum, char, i) => sum + char.charCodeAt(0) + i,
        0
      )
      profileBadge = `\x1b[30;${[43, 46, 42, 45][index % 4]}m ${profile} \x1b[0m`
    }
    return `${profileBadge} ${relative(projectDir, entry.file).replace(/\\/g, '/')}`
  }

  function context(scope: Partial<ResultScope>): string {
    const name =
      scope.entryId && scope.caseId
        ? caseNames.get(
            caseKey({ entryId: scope.entryId, caseId: scope.caseId })
          )
        : undefined
    return `${fileLabel(scope.entryId)}${name ? ` > ${name}` : ''}`
  }

  function divider(text: string, right?: number): string {
    const length = stripVTControlCharacters(text).length
    const left = Math.max(
      0,
      right === undefined
        ? Math.floor((columns - length) / 2)
        : columns - length - right
    )
    return paint(
      31,
      `${'⎯'.repeat(left)}${text}${'⎯'.repeat(Math.max(0, right ?? columns - length - left))}`
    )
  }

  function stateText(state: ResultCounts, todo = 0): string {
    const total = state.passed + state.failed + state.skipped + state.cancelled
    if (!total) return paint(2, 'no tests')
    return (
      (['failed', 'passed', 'skipped', 'cancelled'] as const)
        .map((status) => ({
          status,
          count: state[status] - (status === 'skipped' ? todo : 0),
        }))
        .filter(({ count }) => count)
        .map(({ status, count }) =>
          paint(statusColor(status), `${count} ${status}`)
        )
        .concat(todo ? [paint(90, `${todo} todo`)] : [])
        .join(paint(2, ' | ')) + paint(2, ` (${total})`)
    )
  }

  function printFile(result: FileResult): void {
    const tests = [...cases.values()].filter(
      (test) => test.entryId === result.entryId
    )
    const state = counts()
    for (const test of tests) state[test.status]++
    const todo = tests.filter(
      (test) => test.status === 'skipped' && test.mode === 'todo'
    ).length
    state.skipped -= todo
    const details = [`${tests.length} test${tests.length > 1 ? 's' : ''}`]
    for (const status of ['failed', 'skipped', 'cancelled'] as const) {
      if (state[status]) details.push(`${state[status]} ${status}`)
    }
    if (todo) details.push(`${todo} todo`)
    const fileDuration =
      result.status === 'skipped'
        ? ''
        : ` ${paint(result.durationMs > 300 ? 33 : 32, `${Math.round(result.durationMs)}ms`)}`
    write(
      ` ${symbol(result.status, true)} ${fileLabel(result.entryId)} ${paint(2, `(${details.join(' | ')})`)}${fileDuration}\n`
    )
    const printedSuites = new Set<string>()
    for (const test of tests) {
      // Failed attempts remain evidence, but only the final retry is a result.
      if (
        result.status !== 'failed' &&
        test.status !== 'failed' &&
        test.durationMs <= 300 &&
        !(options.isTTY && options.fileCount === 1)
      )
        continue
      for (const [index, ancestor] of (test.ancestors ?? []).entries()) {
        if (printedSuites.has(ancestor.id)) continue
        printedSuites.add(ancestor.id)
        const children = tests.filter((child) =>
          child.ancestors?.some((parent) => parent.id === ancestor.id)
        )
        const status = children.some((child) => child.status === 'failed')
          ? 'failed'
          : children.some((child) => child.status === 'passed')
            ? 'passed'
            : 'skipped'
        write(
          ` ${'  '.repeat(index + 1)}${symbol(status, true)} ${ancestor.name} ${paint(2, `(${children.length})`)}\n`
        )
      }
      const retry = test.attempt.retry ? ` (retry x${test.attempt.retry})` : ''
      const repeat = test.attempt.repeat
        ? ` (repeat x${test.attempt.repeat})`
        : ''
      const testSymbol =
        test.mode === 'todo' && test.status === 'skipped'
          ? paint(90, '□')
          : symbol(test.status)
      const duration =
        test.status === 'skipped'
          ? ''
          : ` ${paint(test.durationMs > 300 ? 33 : 32, `${Math.round(test.durationMs)}ms`)}`
      write(
        ` ${'  '.repeat((test.ancestors?.length ?? 0) + 1)}${testSymbol} ${test.testName ?? test.name}${duration}${paint(33, retry + repeat)}\n`
      )
    }
  }

  function printFailures(): void {
    const suiteErrors = diagnostics.filter(
      (event) => event.diagnostic.severity === 'error' && event.entryId
    )
    const unhandledErrors = diagnostics.filter(
      (event) => event.diagnostic.severity === 'error' && !event.entryId
    )
    const failedTests = [...cases.values()].filter(
      (test) => test.status === 'failed'
    )
    const total =
      suiteErrors.length +
      failedTests.reduce(
        (sum, test) => sum + Math.max(1, test.errors.length),
        0
      )
    let current = 0
    function failure(title: string, diagnostic?: SerializedDiagnostic) {
      writeError(`${badge('FAIL', 41, color, false)} ${title}\n`)
      if (diagnostic)
        writeError(`${formatDiagnostic(diagnostic, projectDir)}\n`)
      writeError(`${divider(`[${++current}/${total}]`, 1)}\n\n`)
    }
    if (suiteErrors.length) {
      const suiteCount = new Set(suiteErrors.map((event) => event.entryId)).size
      writeError(
        `\n${divider(badge(`Failed Suites ${suiteCount}`, 41, color, false))}\n\n`
      )
      for (const event of suiteErrors)
        failure(
          `${context(event)} ${paint(2, `[${event.diagnostic.phase}]`)}`,
          event.diagnostic
        )
    }
    if (failedTests.length) {
      writeError(
        `\n${divider(badge(`Failed Tests ${failedTests.length}`, 41, color, false))}\n\n`
      )
      for (const test of failedTests) {
        const title = context(test)
        if (!test.errors.length) failure(title)
        for (const error of test.errors) failure(title, error)
      }
    }
    if (unhandledErrors.length) {
      writeError(
        `\n${divider(badge('Unhandled Errors', 41, color, false))}\n\n`
      )
      for (const event of unhandledErrors) {
        writeError(
          `${paint(31, 'Unhandled Error')} ${paint(2, `[${event.diagnostic.phase}]`)}\n${formatDiagnostic(event.diagnostic, projectDir)}\n\n`
        )
      }
    }
  }

  function getSummary(): RunSummary {
    const fileCounts = counts()
    const caseCounts = counts()
    const attemptCounts = counts()
    let errors = diagnosticErrors
    for (const result of files.values()) fileCounts[result.status]++
    for (const result of cases.values()) caseCounts[result.status]++
    for (const result of attempts.values()) {
      attemptCounts[result.status]++
      errors += result.errors.filter(
        (error) => error.severity === 'error'
      ).length
    }
    const failed =
      diagnosticErrors > 0 ||
      fileCounts.failed > 0 ||
      caseCounts.failed > 0 ||
      (ended?.status === 'passed' &&
        (activeAttempts.size > 0 || files.size < entries.size))
    return {
      runId: runId ?? '',
      status: ended
        ? failed || ended.status === 'failed'
          ? 'failed'
          : ended.status === 'cancelled' ||
              fileCounts.cancelled ||
              caseCounts.cancelled
            ? 'cancelled'
            : 'passed'
        : 'running',
      files: fileCounts,
      cases: caseCounts,
      attempts: attemptCounts,
      errors,
      warnings,
      attachments,
    }
  }

  function onEvent(input: ResultEvent): void {
    if (input.version !== 1)
      throw new Error('Unsupported test result event version')
    if (runId !== undefined && input.runId !== runId)
      throw new Error('A test reporter cannot consume multiple runs')
    if (ended) throw new Error('Test result event received after run-end')
    // Own the evidence so producer mutation cannot overwrite failed attempts.
    const event: ResultEvent = structuredClone(input)
    runId = event.runId
    events.push(event)
    switch (event.type) {
      case 'run-start':
        startedAt = event.timestamp
        write(
          `\n${badge(options.rerun ? 'RERUN' : options.watch ? 'DEV' : 'RUN', options.watch || options.rerun ? 44 : 46, color)} ${paint(2, `Next.js${options.version ? ` v${options.version}` : ''}`)} ${paint(2, projectDir)}\n\n`
        )
        break
      case 'file-start':
        entries.set(event.entry.id, event)
        break
      case 'case-start':
        activeAttempts.add(attemptKey(event))
        caseNames.set(caseKey(event), event.name)
        break
      case 'case-end': {
        const key = attemptKey(event)
        if (attempts.has(key))
          throw new Error(`Duplicate attempt result: ${context(event)}`)
        activeAttempts.delete(key)
        attempts.set(key, event)
        caseNames.set(caseKey(event), event.name)
        const keyForRepeat = JSON.stringify([
          event.entryId,
          event.caseId,
          event.attempt.repeat,
        ])
        const previous = cases.get(keyForRepeat)
        if (!previous || previous.attempt.retry < event.attempt.retry)
          cases.set(keyForRepeat, event)
        break
      }
      case 'file-end':
        files.set(event.entryId, event)
        printFile(event)
        break
      case 'diagnostic':
        if (event.diagnostic.severity === 'error') diagnosticErrors++
        else {
          warnings++
          writeError(
            `\n${badge('WARN', 43, color)} ${context(event)} [${event.diagnostic.phase}]\n${formatDiagnostic(event.diagnostic, projectDir)}\n\n`
          )
        }
        diagnostics.push(event)
        break
      case 'output':
        ;(event.stream === 'stderr' ? writeError : write)(
          `${paint(90, `${event.stream} | ${context(event)}`)}\n${event.text}${event.text.endsWith('\n') ? '' : '\n'}\n`
        )
        break
      case 'attachment': {
        attachments++
        const attempt = event.attempt
          ? ` (retry ${event.attempt.retry}, repeat ${event.attempt.repeat})`
          : ''
        write(
          `${paint(90, `attachment | ${context(event)}${attempt}`)}\n${event.attachment.name} [${event.attachment.kind}]: ${event.attachment.path}\n\n`
        )
        break
      }
      case 'run-end': {
        ended = event
        const summary = getSummary()
        printFailures()
        if (summary.status === 'cancelled')
          write(`${badge('CANCELLED', 41, color)} Test run cancelled.\n`)
        else if (
          summary.status === 'failed' &&
          !summary.files.failed &&
          !summary.cases.failed &&
          !diagnosticErrors
        )
          write(
            `${badge('FAIL', 41, color, false)} Test run did not complete successfully.\n`
          )
        const row = (label: string, value: string) =>
          `${paint(2, label.padStart(11))}  ${value}\n`
        write(
          '\n' +
            row('Test Files', stateText(summary.files)) +
            row(
              'Tests',
              stateText(
                summary.cases,
                [...cases.values()].filter(
                  (test) => test.status === 'skipped' && test.mode === 'todo'
                ).length
              )
            )
        )
        const unhandledErrors = diagnostics.filter(
          (diagnostic) =>
            diagnostic.diagnostic.severity === 'error' && !diagnostic.entryId
        ).length
        if (unhandledErrors)
          write(
            row(
              'Errors',
              paint(
                31,
                `${unhandledErrors} error${unhandledErrors === 1 ? '' : 's'}`
              )
            )
          )
        if (startedAt !== undefined)
          write(
            row('Start at', new Date(startedAt).toTimeString().split(' ')[0])
          )
        write(row('Duration', formatDuration(event.durationMs)) + '\n')
        break
      }
    }
  }

  return {
    onEvent,
    getSummary,
    /** Includes every retry's errors, output and artifact paths in arrival order. */
    getEvents: (): ResultEvent[] => structuredClone(events),
  }
}
