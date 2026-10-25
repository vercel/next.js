import { readFile } from 'fs/promises'
import { writeFileSync } from 'fs'
import { parse } from 'next/dist/compiled/babel/parser'
import type { Node, ObjectExpression } from '@babel/types'
import type { StandardCoverageThresholdUpdate } from './types'

const complexConfiguration =
  'Failed to update coverage thresholds. Configuration file is too complex.'

function defineConfiguration(
  node: Node | undefined
): ObjectExpression | undefined {
  if (
    node?.type !== 'CallExpression' ||
    node.callee.type !== 'Identifier' ||
    node.callee.name !== 'defineConfig'
  )
    return
  const argument = node.arguments[0]
  if (argument?.type === 'ObjectExpression') return argument
  if (argument?.type === 'ArrowFunctionExpression') {
    if (argument.body.type === 'ObjectExpression') return argument.body
    return mergeConfiguration(argument.body)
  }
}

function mergeConfiguration(
  node: Node | undefined
): ObjectExpression | undefined {
  if (
    node?.type !== 'CallExpression' ||
    node.callee.type !== 'Identifier' ||
    node.callee.name !== 'mergeConfig'
  )
    return
  for (const argument of node.arguments) {
    const value = defineConfiguration(argument)
    if (value) return value
  }
}

function property(object: ObjectExpression, name: string) {
  return object.properties.find(
    (item) =>
      item.type === 'ObjectProperty' &&
      !item.computed &&
      ((item.key.type === 'Identifier' && item.key.name === name) ||
        (item.key.type === 'StringLiteral' && item.key.value === name))
  )
}

function objectProperty(object: ObjectExpression, name: string) {
  const found = property(object, name)
  if (
    found?.type === 'ObjectProperty' &&
    found.value.type === 'ObjectExpression'
  )
    return found.value
  throw new Error(
    'Unable to parse thresholds from configuration file: Expected config.test.coverage.thresholds to be an object'
  )
}

/** Prepare a complete edit synchronously; formatters run at each actual assignment. */
export function prepareCoverageThresholdEdits(options: {
  configFile: string
  source: string
  updates: readonly StandardCoverageThresholdUpdate[]
  formatter?: (value: number, previous: number) => number
}): string | undefined {
  const { configFile, source, updates, formatter } = options
  const json = configFile.endsWith('.json')
  const offset = json ? 1 : 0
  const parsed = parse(json ? `(${source})` : source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    tokens: true,
  })
  let root: ObjectExpression | undefined
  if (json) {
    const statement = parsed.program.body[0]
    if (
      statement?.type === 'ExpressionStatement' &&
      statement.expression.type === 'ObjectExpression'
    )
      root = statement.expression
  } else {
    const statement = parsed.program.body.find(
      (node) => node.type === 'ExportDefaultDeclaration'
    )
    if (statement?.type === 'ExportDefaultDeclaration') {
      const declaration = statement.declaration
      root =
        declaration.type === 'ObjectExpression'
          ? declaration
          : (defineConfiguration(declaration) ??
            mergeConfiguration(declaration))
    }
  }
  if (!root) throw new Error(complexConfiguration)
  const thresholds = objectProperty(
    objectProperty(objectProperty(root, 'test'), 'coverage'),
    'thresholds'
  )
  const edits: { start: number; end: number; value: string }[] = []
  const additions = new Map<
    ObjectExpression,
    StandardCoverageThresholdUpdate[]
  >()
  for (const original of updates) {
    const update = formatter
      ? { ...original, value: formatter(original.value, original.previous) }
      : original
    if (formatter && typeof update.value !== 'number')
      throw new TypeError(
        'A coverage threshold formatter must return a number.'
      )
    if (
      formatter &&
      update.pattern !== undefined &&
      !property(thresholds, update.pattern)
    ) {
      // The provider reaches an ordinary assignment when its current glob vanished.
      const missing: Record<string, number> | undefined = undefined
      missing![update.metric] = update.value
    }
    const target =
      update.pattern === undefined
        ? thresholds
        : objectProperty(thresholds, update.pattern)
    const found = property(target, update.metric)
    if (found?.type === 'ObjectProperty') {
      edits.push({
        start: found.value.start! - offset,
        end: found.value.end! - offset,
        value: String(update.value),
      })
    } else {
      const pending = additions.get(target) ?? []
      pending.push(update)
      additions.set(target, pending)
    }
  }
  for (const [target, pending] of [...additions].sort(
    (a, b) => b[0].start! - a[0].start!
  )) {
    const closing = target.end! - offset - 1
    const last = target.properties[target.properties.length - 1]
    const lastEnd = last ? last.end! - offset : closing
    const trailingComma =
      last &&
      parsed.tokens?.some(
        (token) =>
          token.start! >= last.end! &&
          token.end! < target.end! &&
          token.type.label === ','
      )
    const closingLine = source.lastIndexOf('\n', closing - 1) + 1
    const multiline =
      source.slice(target.start! - offset, closing).includes('\n') &&
      !source.slice(closingLine, closing).trim()
    const fields = pending.map(
      ({ metric, value }) =>
        `${json ? JSON.stringify(metric) : metric}: ${value}`
    )
    if (multiline && last && !trailingComma)
      edits.push({ start: lastEnd, end: lastEnd, value: ',' })
    if (multiline) {
      const lastLine = last
        ? source.lastIndexOf('\n', last.start! - offset - 1) + 1
        : closingLine
      const indentation = last
        ? source.slice(lastLine, last.start! - offset).match(/^\s*/)?.[0]
        : source.slice(closingLine, closing) + '  '
      edits.push({
        start: closingLine,
        end: closingLine,
        value:
          fields.map((field) => `${indentation}${field}`).join(',\n') + '\n',
      })
    } else {
      // Recast expands an inline object when its property inventory changes,
      // retaining the existing property spelling rather than regenerating the
      // surrounding configuration. Apply actual value edits to those spans.
      const start = target.start! - offset
      const indentation =
        source
          .slice(source.lastIndexOf('\n', start - 1) + 1, start)
          .match(/^[\t ]*/)?.[0] ?? ''
      const inner = edits.filter(
        (edit) => edit.start >= start && edit.end <= closing + 1
      )
      function rewrittenSpan(begin: number, end: number) {
        let value = source.slice(begin, end)
        for (const edit of inner
          .filter((change) => change.start >= begin && change.end <= end)
          .sort((a, b) => b.start - a.start))
          value =
            value.slice(0, edit.start - begin) +
            edit.value +
            value.slice(edit.end - begin)
        return value
      }
      const existing = target.properties.map((item, index) => {
        const previous = index
          ? target.properties[index - 1].end! - offset
          : start + 1
        const prefix = source
          .slice(previous, item.start! - offset)
          .replace(/^\s*,\s*/, '')
          .trim()
        return (
          (prefix ? prefix + ' ' : '') +
          rewrittenSpan(item.start! - offset, item.end! - offset)
        )
      })
      if (last) {
        const tail = source
          .slice(last.end! - offset, closing)
          .replace(/^\s*,\s*/, '')
          .trim()
        if (tail) existing[existing.length - 1] += ' ' + tail
      }
      for (const edit of inner) edits.splice(edits.indexOf(edit), 1)
      edits.push({
        start,
        end: closing + 1,
        value:
          '{\n' +
          [...existing, ...fields]
            .map((field) => indentation + '  ' + field)
            .join(',\n') +
          '\n' +
          indentation +
          '}',
      })
    }
  }
  if (!updates.length) return undefined
  let rewritten = source
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end))
    rewritten =
      rewritten.slice(0, edit.start) + edit.value + rewritten.slice(edit.end)
  return rewritten
}

interface ThresholdUpdateOptions {
  configFile: string | undefined
  updates: readonly StandardCoverageThresholdUpdate[]
  signal?: AbortSignal
}

const missingConfiguration =
  'Missing configurationFile. The "coverage.thresholds.autoUpdate" can only be enabled when configuration file is used.'

/** The actual formatter realm reads its selected file, without writing it. */
export async function prepareCoverageThresholdUpdate(
  options: ThresholdUpdateOptions & {
    formatter: (value: number, previous: number) => number
  }
): Promise<string | undefined> {
  const { configFile, signal } = options
  signal?.throwIfAborted()
  if (!configFile) throw new Error(missingConfiguration)
  const source = await readFile(configFile, 'utf8')
  signal?.throwIfAborted()
  return prepareCoverageThresholdEdits({ ...options, configFile, source })
}

/** Only the caller commits its selected configuration, after cancellation checks. */
export function commitCoverageThresholdUpdate(options: {
  configFile: string | undefined
  source: string | undefined
  signal?: AbortSignal
}): boolean {
  options.signal?.throwIfAborted()
  if (options.source === undefined) return false
  if (!options.configFile) throw new Error(missingConfiguration)
  writeFileSync(options.configFile, options.source, 'utf8')
  return true
}

/** Boolean callers retain their original read, preparation and synchronous write. */
export async function updateCoverageThresholds(
  options: ThresholdUpdateOptions
) {
  const { configFile, updates, signal } = options
  signal?.throwIfAborted()
  if (!configFile) throw new Error(missingConfiguration)
  const source = await readFile(configFile, 'utf8')
  signal?.throwIfAborted()
  const rewritten = prepareCoverageThresholdEdits({
    configFile,
    source,
    updates,
  })
  if (rewritten === undefined) return false
  signal?.throwIfAborted()
  writeFileSync(configFile, rewritten, 'utf8')
  return true
}
