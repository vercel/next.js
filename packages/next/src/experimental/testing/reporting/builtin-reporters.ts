import {
  isRunErrorDiagnostic,
  hasOnlyBrowserWorkerCleanupFailures,
} from './run-errors'
import { writeFile } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { CaseResult, ResultEvent, SerializedDiagnostic } from './events'
import { formatDiagnostic, type createTestReporter } from './reporter'

type Results = ReturnType<ReturnType<typeof createTestReporter>['getResults']>
interface TapTask {
  id: string
  name: string
  mode: 'run' | 'skip' | 'todo'
  passed: boolean
  duration?: number
  errors: SerializedDiagnostic[]
  annotations?: CaseResult['annotations']
  children: TapTask[]
}

const tapName = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/#/g, '\\#').replace(/\n/g, ' ')
const yaml = (value: string) => JSON.stringify(value)

/** Render the Next-owned collected task tree using the pinned TAP hierarchy. */
export function renderTapReport(
  results: Results,
  events: readonly ResultEvent[],
  options: { projectDir: string; flat?: boolean }
): string {
  const files: TapTask[] = []
  for (const { entry } of results.entries) {
    const completed = results.files.find((file) => file.entryId === entry.id)
    const tasks = new Map<string, TapTask>()
    const rootSuite = results.suites.find(
      (suite) => suite.suiteId === entry.id && suite.entryId === entry.id
    )
    const root: TapTask = {
      id: entry.id,
      name: relative(options.projectDir, entry.file).split(sep).join('/'),
      mode: rootSuite?.mode ?? 'run',
      passed:
        completed?.status === 'passed' ||
        completed?.status === 'skipped' ||
        hasOnlyBrowserWorkerCleanupFailures(entry.id, { ...results, events }),
      duration: rootSuite?.durationMs ?? completed?.durationMs,
      errors: rootSuite?.errors ?? [],
      children: [],
    }
    tasks.set(entry.id, root)
    const suites = results.suites.filter(
      (suite) => suite.entryId === entry.id && suite.suiteId !== entry.id
    )
    for (const suite of suites)
      tasks.set(suite.suiteId, {
        id: suite.suiteId,
        name: suite.name,
        mode: suite.mode,
        passed: suite.status === 'passed' || suite.status === 'skipped',
        duration: suite.durationMs,
        errors: suite.errors,
        children: [],
      })
    function ensureAncestors(ancestors: { id: string; name: string }[] = []) {
      let parent = root
      for (const ancestor of ancestors) {
        let node = tasks.get(ancestor.id)
        if (!node) {
          node = {
            id: ancestor.id,
            name: ancestor.name,
            mode: 'run',
            passed: true,
            errors: [],
            children: [],
          }
          tasks.set(ancestor.id, node)
        }
        if (!parent.children.includes(node)) parent.children.push(node)
        parent = node
      }
      return parent
    }
    for (const suite of suites) {
      const parent = ensureAncestors(suite.ancestors)
      const node = tasks.get(suite.suiteId)!
      if (!parent.children.includes(node)) parent.children.push(node)
    }
    for (const test of results.cases.filter(
      (candidate) => candidate.entryId === entry.id
    )) {
      const parent = ensureAncestors(test.ancestors)
      parent.children.push({
        id: test.caseId,
        name: test.testName ?? test.name,
        mode: test.mode ?? 'run',
        passed: test.status === 'passed' || test.status === 'skipped',
        duration: test.bail ? undefined : test.durationMs,
        errors: test.errors,
        annotations: test.annotations,
        children: [],
      })
    }
    root.errors.push(
      ...events.flatMap((event) =>
        event.type === 'diagnostic' &&
        event.entryId === entry.id &&
        !isRunErrorDiagnostic(event.diagnostic) &&
        event.diagnostic.severity === 'error'
          ? [event.diagnostic]
          : []
      )
    )
    function order(node: TapTask) {
      node.children.sort((left, right) => {
        const a = Number(left.id.slice(node.id.length + 1).split('/')[0])
        const b = Number(right.id.slice(node.id.length + 1).split('/')[0])
        return Number.isSafeInteger(a) && Number.isSafeInteger(b) ? a - b : 0
      })
      for (const child of node.children) order(child)
    }
    order(root)
    files.push(root)
  }
  const unhandled = events.flatMap((event) =>
    event.type === 'diagnostic' &&
    (!event.entryId || isRunErrorDiagnostic(event.diagnostic)) &&
    event.diagnostic.runError !== 'browser-worker-fixture-cleanup' &&
    event.diagnostic.severity === 'error'
      ? [event.diagnostic]
      : []
  )
  if (unhandled.length)
    files.push({
      id: 'run-errors',
      name: '[run errors]',
      mode: 'run',
      passed: false,
      errors: unhandled,
      children: [],
    })
  const flatten = (node: TapTask, parent = ''): TapTask[] => {
    const name = parent ? `${parent} > ${node.name}` : node.name
    return node.children.length
      ? node.children.flatMap((child) => flatten(child, name))
      : [{ ...node, name }]
  }
  const lines = ['TAP version 13']
  function render(tasks: TapTask[], indent = '') {
    lines.push(`${indent}1..${tasks.length}`)
    for (const [index, task] of tasks.entries()) {
      const skipped = task.mode === 'skip' || task.mode === 'todo'
      const comment =
        task.mode === 'skip'
          ? ' # SKIP'
          : task.mode === 'todo'
            ? ' # TODO'
            : task.duration === undefined
              ? ''
              : ` # time=${task.duration.toFixed(2)}ms`
      const prefix = `${indent}${task.passed || skipped ? 'ok' : 'not ok'} ${index + 1} - ${tapName(task.name)}${comment}`
      lines.push(`${prefix}${task.children.length ? ' {' : ''}`)
      if (task.children.length) {
        render(task.children, `${indent}    `)
        lines.push(`${indent}}`)
        continue
      }
      for (const annotation of task.annotations ?? [])
        for (const message of annotation.message.split(/\r?\n/))
          lines.push(`${indent}    # ${annotation.type}: ${message}`)
      if (!task.passed && task.errors.length) {
        for (const error of task.errors) {
          lines.push(
            `${indent}    ---`,
            `${indent}    error:`,
            `${indent}        name: ${yaml(error.name ?? 'Unknown Error')}`,
            `${indent}        message: ${yaml(error.message)}`
          )
          const location = error.location ?? error.frames?.[0]
          if (location)
            lines.push(
              `${indent}    at: ${yaml(`${location.file}:${location.line ?? 1}:${location.column ?? 1}`)}`
            )
        }
        lines.push(`${indent}    ...`)
      }
    }
  }
  render(options.flat ? files.flatMap((file) => flatten(file)) : files)
  return `${lines.join('\n')}\n`
}

const escapeData = (value: string) =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const escapeProperty = (value: string) =>
  escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C')
function command(
  type: string,
  properties: Record<string, string>,
  message: string
) {
  const fields = Object.entries(properties)
    .map(([name, value]) => `${name}=${escapeProperty(value)}`)
    .join(',')
  return `::${type}${fields ? ` ${fields}` : ''}::${escapeData(stripVTControlCharacters(message))}\n`
}

/** GitHub workflow annotations carry real source-mapped diagnostics and notes. */
export async function writeGithubActionsReport(
  results: Results,
  events: readonly ResultEvent[],
  options: { write(text: string): void; signal?: AbortSignal }
) {
  const reportError = (title: string, error: SerializedDiagnostic) => {
    const location =
      error.location ??
      error.frames?.find(
        (frame) => frame.original !== false && frame.line !== undefined
      )
    if (!location) return
    options.write(
      `\n${command('error', { file: location.file, title, line: String(location.line ?? 1), column: String(location.column ?? 1) }, formatDiagnostic(error))}`
    )
  }
  for (const test of results.cases) {
    options.signal?.throwIfAborted()
    const entry = results.entries.find(
      (item) => item.entry.id === test.entryId
    )?.entry
    const title = [
      entry?.file,
      ...(test.ancestors?.map((suite) => suite.name) ?? []),
      test.testName ?? test.name,
    ]
      .filter(Boolean)
      .join(' > ')
    if (test.status === 'failed' || (test.status === 'cancelled' && !test.bail))
      for (const error of test.errors) reportError(title, error)
    for (const annotation of test.annotations ?? []) {
      if (!annotation.location) continue
      const type = ['notice', 'error', 'warning'].includes(annotation.type)
        ? annotation.type
        : 'notice'
      const properties: Record<string, string> = {
        file: annotation.location.file,
        line: String(annotation.location.line),
        column: String(annotation.location.column),
      }
      if (type !== annotation.type) properties.title = annotation.type
      options.write(`\n${command(type, properties, annotation.message)}`)
    }
  }
  for (const suite of results.suites)
    if (suite.status === 'failed')
      for (const error of suite.errors) reportError(suite.name, error)
  for (const event of events)
    if (event.type === 'diagnostic' && event.diagnostic.severity === 'error')
      reportError(event.entryId ?? 'Unhandled error', event.diagnostic)
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    options.signal?.throwIfAborted()
    const passed = results.cases.filter(
      (test) => test.status === 'passed'
    ).length
    const failed = results.cases.filter(
      (test) =>
        test.status === 'failed' || (test.status === 'cancelled' && !test.bail)
    ).length
    const skipped = results.cases.filter(
      (test) => test.status === 'skipped'
    ).length
    await writeFile(
      summaryPath,
      `## Next.js Test Report\n\n| Passed | Failed | Skipped |\n| --- | --- | --- |\n| ${passed} | ${failed} | ${skipped} |\n`,
      { encoding: 'utf8', flag: 'a', signal: options.signal }
    )
  }
}
