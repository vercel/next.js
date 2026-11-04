import { parse } from 'next/dist/compiled/babel/parser'
import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseStack } from '../../../server/lib/parse-stack'
import {
  getTestStackFrames,
  isTestFrameIgnored,
  isTestFrameOriginal,
} from '../reporting/test-stack-frames'
import type { ModernSourceMapPayload } from '../../../server/lib/source-maps'
import type { CompiledTestArtifact } from '../contracts'
import type { TestArtifactLocation } from '../runner/tasks'
import { createArtifactSourceMapLookup } from './source-maps'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc?: { start: Point; end: Point }
  callee?: Node
  arguments?: Node[]
}
type Mapping = {
  generatedLine: number
  generatedColumn: number
  source: string | null
  originalLine: number | null
  originalColumn: number | null
}
export type RegistrationOrigin = {
  location: TestArtifactLocation
  source: string
}
function collectMappings(payload: ModernSourceMapPayload): Mapping[] {
  const mappings: Mapping[] = []
  function visit(map: ModernSourceMapPayload, offset: Point) {
    if ('sections' in map) {
      for (const section of map.sections)
        visit(section.map, {
          line: offset.line + section.offset.line,
          column:
            section.offset.column +
            (section.offset.line === 0 ? offset.column : 0),
        })
    } else {
      // Enumerate each basic map through its public API. The indexed consumer's
      // enumeration cannot retain an unmapped section in the pinned library.
      const consumer = new SourceMapConsumer(map as unknown as RawSourceMap)
      consumer.eachMapping((mapping: Mapping) =>
        mappings.push({
          ...mapping,
          generatedLine: mapping.generatedLine + offset.line,
          generatedColumn:
            mapping.generatedColumn +
            (mapping.generatedLine === 1 ? offset.column : 0),
        })
      )
    }
  }
  visit(payload, { line: 0, column: 0 })
  return mappings
}
const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
function filename(url: string): string | undefined {
  try {
    return url.startsWith('file:') ? fileURLToPath(url) : resolve(url)
  } catch {
    return
  }
}
function contained(root: string, file: string): boolean {
  const path = relative(root, file)
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}
function calls(source: string, file: string): Node[] {
  const result: Node[] = []
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as Node
    if (node.type === 'CallExpression') result.push(node)
    for (const [key, child] of Object.entries(value)) {
      if (!['loc', 'tokens', 'comments'].includes(key)) visit(child)
    }
  }
  visit(
    parse(source, {
      sourceType: 'unambiguous',
      sourceFilename: file,
      allowReturnOutsideFunction: true,
      createParenthesizedExpressions: true,
      plugins: [
        ...(/\.[cm]?ts$/.test(file) ? [] : ['jsx' as const]),
        'decorators-legacy',
        ...(/\.[cm]?tsx?$/.test(file) ? ['typescript' as const] : []),
      ],
    })
  )
  return result
}

/**
 * A registration deadline retains its actual declaration Error. Resolve its generated
 * callee using this leased artifact's syntax, exact mappings and retained entry
 * bytes. In particular, coincident mappings cannot be selected by GLB alone.
 */
export function createArtifactRegistrationOriginMapper(
  artifact: CompiledTestArtifact,
  entryFile: string
): (error: Error | string) => RegistrationOrigin | undefined {
  if (
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    !artifact.sourceHash
  )
    return () => undefined
  const root = realpathSync(artifact.rootDir)
  const selected = resolve(entryFile)
  const files = new Set(artifact.files)
  const lookup = createArtifactSourceMapLookup(artifact)
  type Chunk = {
    calls: Node[]
    original: Node[]
    mappings: Mapping[]
    consumer: SourceMapConsumer
    source: string
    content: string
  }
  const cache = new Map<string, Chunk | undefined>()
  const read = (chunk: string): Chunk | undefined => {
    if (cache.has(chunk)) return cache.get(chunk)
    let result: Chunk | undefined
    try {
      const rel = relative(resolve(artifact.rootDir), chunk)
      if (
        !files.has(rel) ||
        !files.has(`${rel}.map`) ||
        !contained(root, realpathSync(chunk))
      )
        return
      const payload = lookup(chunk)
      if (!payload) return
      const consumer = new SourceMapConsumer(payload as unknown as RawSourceMap)
      const names = (consumer as SourceMapConsumer & { sources: string[] })
        .sources
      const selectedSources = names.filter((name) => {
        try {
          return (
            filename(new URL(name, pathToFileURL(`${chunk}.map`)).href) ===
            selected
          )
        } catch {
          return false
        }
      })
      if (selectedSources.length !== 1) return
      const source = selectedSources[0]
      const content = consumer.sourceContentFor(source, true)
      if (
        typeof content !== 'string' ||
        createHash('sha256').update(content).digest('hex') !==
          artifact.sourceHash
      )
        return
      const mappings = collectMappings(payload)
      result = {
        calls: calls(readFileSync(chunk, 'utf8'), chunk),
        original: calls(content, selected),
        consumer,
        mappings,
        source,
        content,
      }
    } catch {
      // Unsupported syntax, absent bytes or malformed maps keep the raw origin.
    } finally {
      cache.set(chunk, result)
    }
    return result
  }
  return (error) => {
    const readStack = () => (typeof error === 'string' ? error : error.stack)
    try {
      if (!readStack()) return
      // An imported registration helper must not borrow its caller's origin.
      const firstSource = getTestStackFrames(
        readStack()!,
        typeof error === 'string'
          ? { reportInvalidSourceMaps: false }
          : undefined
      ).find(
        (frame) => isTestFrameOriginal(frame) && !isTestFrameIgnored(frame)
      )
      const first = firstSource?.frame
      if (!first?.file || filename(first.file) !== selected) return
      if (firstSource?.kind === 'authored' && first.line1 && first.column1) {
        // Node already supplied original coordinates. This path retains those
        // exact coordinates and bytes; it does not infer a generated callee or
        // apply the separate generated-AST correction below.
        if (firstSource.source.sha256 !== artifact.sourceHash) return
        const point = { line: first.line1, column: first.column1 - 1 }
        const declarations = calls(firstSource.source.content, selected).filter(
          (call) =>
            call.callee?.type === 'Identifier' &&
            call.callee.loc &&
            compare(call.callee.loc.start, point) <= 0 &&
            compare(point, call.callee.loc.end) <= 0
        )
        if (declarations.length !== 1) return
        return {
          location: {
            file: selected,
            line: first.line1,
            column: first.column1,
          },
          source: firstSource.source.content,
        }
      }
      for (const frame of parseStack(readStack()!)) {
        if (!frame.file || !frame.line1 || !frame.column1) continue
        const chunk = filename(frame.file)
        if (!chunk || !isAbsolute(chunk)) continue
        const data = read(chunk)
        if (!data) continue
        const point = { line: frame.line1, column: frame.column1 - 1 }
        const generated = data.calls.filter(
          (call) =>
            call.callee?.loc &&
            compare(call.callee.loc.start, point) <= 0 &&
            compare(point, call.callee.loc.end) <= 0
        )
        if (generated.length !== 1) return
        const call = generated[0]
        if (!call.loc || !call.arguments?.length) return
        const starts = data.mappings.filter(
          (mapping) =>
            mapping.source === data.source &&
            mapping.generatedLine === call.loc!.start.line &&
            mapping.generatedColumn === call.loc!.start.column
        )
        const matched = data.original.filter(
          (candidate) =>
            candidate.callee?.type === 'Identifier' &&
            candidate.loc &&
            starts.some(
              (mapping) =>
                mapping.originalLine === candidate.loc!.start.line &&
                mapping.originalColumn === candidate.loc!.start.column
            ) &&
            candidate.arguments?.length === call.arguments!.length &&
            candidate.arguments.every((argument, index) => {
              const emitted = call.arguments![index]
              if (!emitted.loc || !argument.loc) return false
              const mapped = data.consumer.originalPositionFor(
                emitted.loc.start
              )
              return (
                mapped.source === data.source &&
                mapped.line === argument.loc.start.line &&
                mapped.column === argument.loc.start.column
              )
            })
        )
        if (matched.length !== 1) return
        return {
          location: {
            file: selected,
            line: matched[0].loc!.start.line,
            column: matched[0].loc!.start.column + 1,
          },
          source: data.content,
        }
      }
    } catch {
      // A missing unique association never changes an existing diagnostic.
    }
    return
  }
}
