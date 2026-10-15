import { register } from 'node:module'
import { MessageChannel } from 'node:worker_threads'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { SourceSelectionPlan } from './source-selection'

/** Pass through the real Node loader; config sources never use a test evaluator. */
export async function beginConfigProvenance(
  parseSource?: (source: string, file: string) => Promise<unknown>
) {
  const { port1, port2 } = new MessageChannel()
  const edges = new Map<string, { url: string; specifier?: string }[]>()
  const sources = new Map<string, { format: string; sha256?: string }>()
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  let finishFlush: (() => void) | undefined
  let sealed = false
  let failed = false
  port1.on('message', (message) => {
    if (message.type === 'ready') {
      resolveReady()
      return
    }
    if (message.type === 'flushed') {
      finishFlush?.()
      return
    }
    if (sealed) {
      process.exitCode = 1
      failed = true
      return
    }
    if (message.type === 'edge' && typeof message.url === 'string') {
      if (typeof message.parent === 'string') {
        const set = edges.get(message.parent) ?? []
        set.push({ url: message.url, specifier: message.specifier })
        edges.set(message.parent, set)
      }
    } else if (message.type === 'source' && typeof message.url === 'string') {
      sources.set(message.url, {
        format: message.format,
        sha256: message.sha256,
      })
    } else failed = true
  })
  register(pathToFileURL(require.resolve('./config-provenance-loader')).href, {
    parentURL: pathToFileURL(__filename).href,
    data: { port: port2 },
    transferList: [port2],
  })
  await ready
  return {
    async finish(
      roots: string[],
      certifiedTestConfig: boolean
    ): Promise<SourceSelectionPlan['configuration']> {
      await new Promise<void>((resolve) => {
        finishFlush = resolve
        port1.postMessage({ type: 'flush', id: 1 })
      })
      sealed = true
      // Keep listening until actual process exit. A late loader write poisons
      // the child's exit code and cannot silently extend a completed plan.
      port1.unref()
      let complete = certifiedTestConfig && !failed && Boolean(parseSource)
      const files = new Map<string, string>()
      const queue: string[] = []
      for (const root of roots) {
        const actual = await realpath(root)
        if (actual !== root) complete = false
        const matches: string[] = []
        for (const url of sources.keys()) {
          if (
            url.startsWith('file:') &&
            (await realpath(fileURLToPath(url))) === actual
          )
            matches.push(url)
        }
        if (!matches.length) complete = false
        queue.push(...matches)
      }
      const seen = new Set<string>()
      for (const url of queue) {
        if (seen.has(url)) continue
        seen.add(url)
        if (url.startsWith('node:')) {
          if (
            [
              'node:module',
              'node:vm',
              'node:child_process',
              'node:worker_threads',
            ].includes(url)
          )
            complete = false
          continue
        }
        const source = sources.get(url)
        if (
          !url.startsWith('file:') ||
          !source ||
          source.format !== 'module' ||
          !source.sha256
        ) {
          complete = false
          continue
        }
        const file = await realpath(fileURLToPath(url))
        if (files.has(file) && files.get(file) !== source.sha256)
          complete = false
        files.set(file, source.sha256)
        const bytes = await readFile(file)
        if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
          complete = false
        // The asynchronous Node hook cannot observe synchronous createRequire
        // or opaque global loader APIs. Only parser-certified data modules can
        // establish completeness on this path; arbitrary executable config widens.
        try {
          if (
            !parseSource ||
            !plainConfigSyntax(await parseSource(bytes.toString('utf8'), file))
          )
            complete = false
        } catch {
          complete = false
        }
        for (const edge of edges.get(url) ?? []) {
          if (edge.url.startsWith('file:')) {
            if (
              !edge.specifier ||
              (!edge.specifier.startsWith('.') &&
                !edge.specifier.startsWith('file:') &&
                !edge.specifier.startsWith('/'))
            )
              complete = false
            else {
              const lexical = fileURLToPath(new URL(edge.specifier, url))
              if (
                (await realpath(lexical)) !== lexical ||
                (await realpath(lexical)) !== fileURLToPath(edge.url)
              )
                complete = false
            }
          }
          queue.push(edge.url)
        }
      }
      return {
        complete,
        files: [...files].map(([file, sha256]) => ({ file, sha256 })),
      }
    },
    abandon() {
      sealed = true
      port1.unref()
    },
  }
}

/** Syntax classification only; actual dependency identities come from Node. */
function plainConfigSyntax(node: unknown): boolean {
  const allowed = new Set([
    'Module',
    'Script',
    'ImportDeclaration',
    'ImportSpecifier',
    'ImportDefaultSpecifier',
    'ImportNamespaceSpecifier',
    'ExportDeclaration',
    'ExportDefaultExpression',
    'ExportNamedDeclaration',
    'ExportSpecifier',
    'ExportNamespaceSpecifier',
    'ExportDefaultSpecifier',
    'ExportAllDeclaration',
    'VariableDeclaration',
    'VariableDeclarator',
    'Identifier',
    'BindingIdentifier',
    'ObjectExpression',
    'KeyValueProperty',
    'ArrayExpression',
    'StringLiteral',
    'NumericLiteral',
    'BooleanLiteral',
    'NullLiteral',
    'UnaryExpression',
    'ExpressionStatement',
    'EmptyStatement',
  ])
  function visit(value: unknown): boolean {
    if (!value || typeof value !== 'object') return true
    if (Array.isArray(value)) return value.every(visit)
    const record = value as Record<string, unknown>
    if (typeof record.type === 'string' && !allowed.has(record.type))
      return false
    return Object.values(record).every(visit)
  }
  return visit(node)
}
