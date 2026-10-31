import { createIstanbulJsxBodyProjection } from './istanbul-jsx-body'
import type { Program } from '@babel/types'
import { parse } from 'next/dist/compiled/babel/parser'
import {
  SourceMapConsumer,
  SourceMapGenerator,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import { isDeepStrictEqual } from 'util'
import type { CompilerTransformSourceMap } from '../compiler/transform-hooks'
import type { IstanbulRawFileCoverage } from './istanbul-types'

type Point = { line: number; column: number }
type AstNode = {
  type: string
  start?: number
  end?: number
  loc?: { start: Point; end: Point }
  body?: AstNode[] | AstNode
  declaration?: AstNode
  directives?: unknown[]
  interpreter?: unknown
  id?: AstNode
  name?: string
  async?: boolean
  generator?: boolean
  params?: AstNode[]
}
type FunctionNode = AstNode & {
  id: AstNode & { name: string; loc: { start: Point; end: Point } }
  loc: { start: Point; end: Point }
  params: AstNode[]
  body: AstNode & {
    start: number
    loc: { start: Point; end: Point }
    body: AstNode[]
  }
}
type MapRole = {
  generated: Point
  source: string | null
  original: { line: number | null; column: number | null }
  name: string | null
}
const same = (a: Point, b: { line: number | null; column: number | null }) =>
  a.line === b.line && a.column === b.column

function semantic(
  value: unknown,
  project?: (value: unknown) => unknown
): unknown {
  if (Array.isArray(value))
    return value.map((child) => semantic(child, project))
  if (!value || typeof value !== 'object') return value
  const projected = project?.(value)
  if (projected !== undefined) return projected
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            'loc',
            'start',
            'end',
            'extra',
            'typeAnnotation',
            'returnType',
            'typeParameters',
            'comments',
            'leadingComments',
            'trailingComments',
            'innerComments',
          ].includes(key)
      )
      .map(([key, child]) => [key, semantic(child, project)])
  )
}
function exportedFunctions(
  program: AstNode,
  typed: boolean,
  support?: ReadonlySet<unknown>
) {
  if (
    !Array.isArray(program.body) ||
    program.directives?.length ||
    program.interpreter ||
    program.body.some(
      (node) =>
        !support?.has(node) &&
        !(typed && node.type === 'TSTypeAliasDeclaration') &&
        !(
          node.type === 'ExportNamedDeclaration' &&
          (node.declaration?.type === 'FunctionDeclaration' ||
            (typed && node.declaration?.type === 'TSTypeAliasDeclaration'))
        )
    )
  )
    return
  const functions = program.body.flatMap((node) =>
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'FunctionDeclaration'
      ? [node.declaration]
      : []
  )
  if (
    !functions.length ||
    functions.some(
      (node) =>
        node.async ||
        node.generator ||
        node.id?.type !== 'Identifier' ||
        typeof node.id.name !== 'string' ||
        !node.id.loc ||
        !node.loc ||
        !Array.isArray(node.params) ||
        node.params.some((parameter) => parameter.type !== 'Identifier') ||
        !node.body ||
        Array.isArray(node.body) ||
        node.body.type !== 'BlockStatement' ||
        typeof node.body.start !== 'number' ||
        !node.body.loc ||
        !Array.isArray(node.body.body) ||
        !node.body.body.length
    )
  )
    return
  return functions as FunctionNode[]
}
function roles(map: CompilerTransformSourceMap) {
  const result: MapRole[] = []
  new SourceMapConsumer(map as unknown as RawSourceMap).eachMapping((mapping) =>
    result.push({
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      source: mapping.source,
      original: {
        line: mapping.originalLine,
        column: mapping.originalColumn,
      },
      name: mapping.name,
    })
  )
  return result
}

/** Report-only body-token association; this never admits a typed compiler input. */
export function bindIstanbulTypeScriptBodyMappings({
  file,
  authoredSource,
  emittedSource,
  rawCoverage,
}: {
  file: string
  authoredSource: string
  emittedSource: string
  rawCoverage: IstanbulRawFileCoverage
}): IstanbulRawFileCoverage | undefined {
  try {
    const map = rawCoverage.inputSourceMap
    if (
      !/\.(?:ts|mts|[jt]sx)$/.test(file) ||
      rawCoverage.path !== file ||
      map?.version !== 3 ||
      (map as CompilerTransformSourceMap & { sourceRoot?: unknown })
        .sourceRoot ||
      map.sources.length !== 1 ||
      map.sources[0] !== file ||
      map.sourcesContent?.length !== 1 ||
      map.sourcesContent[0] !== authoredSource
    )
      return
    const authoredProgram = parse(authoredSource, {
      sourceType: 'module',
      plugins: file.endsWith('.jsx')
        ? ['jsx']
        : /\.tsx$/.test(file)
          ? ['typescript', 'jsx']
          : ['typescript'],
    }).program
    const emittedFile = parse(emittedSource, {
      sourceType: 'module',
      tokens: true,
    })
    const emittedProgram = emittedFile.program
    const mappings = roles(map)
    const jsx = /\.[jt]sx$/.test(file)
      ? createIstanbulJsxBodyProjection({
          file,
          authored: authoredProgram as unknown as Program,
          emitted: emittedProgram as unknown as Program,
          mappings,
          tokens: emittedFile.tokens ?? [],
          rawCoverage,
          semantic,
        })
      : undefined
    const authored = exportedFunctions(
      authoredProgram as unknown as AstNode,
      true
    )
    const emitted = exportedFunctions(
      emittedProgram as unknown as AstNode,
      false,
      jsx?.supportStatements
    )
    const functions = Object.values(rawCoverage.fnMap)
    if (
      !authored ||
      !emitted ||
      functions.length !== authored.length ||
      functions.length !== emitted.length
    )
      return
    const unusedAuthored = new Set(authored)
    const unusedEmitted = new Set(emitted)
    const additions: { generated: Point; original: Point }[] = []
    for (const role of functions) {
      const generated = emitted.filter(
        (node) =>
          node.id.name === role.name &&
          same(node.id.loc.start, role.decl.start) &&
          same(node.id.loc.end, role.decl.end) &&
          same(node.body.loc.start, role.loc.start) &&
          same(node.body.loc.end, role.loc.end)
      )
      if (generated.length !== 1 || !unusedEmitted.delete(generated[0])) return
      const original = authored.filter(
        (node) =>
          node.id.name === role.name &&
          isDeepStrictEqual(
            semantic(node.params),
            semantic(generated[0].params)
          ) &&
          isDeepStrictEqual(
            semantic(node.body),
            semantic(generated[0].body, jsx?.project)
          )
      )
      if (original.length !== 1 || !unusedAuthored.delete(original[0])) return
      const name = mappings.filter((mapping) =>
        same(generated[0].id.loc.start, mapping.generated)
      )
      if (
        name.length !== 1 ||
        name[0].name !== role.name ||
        name[0].source !== file ||
        !same(original[0].id.loc.start, name[0].original) ||
        authoredSource[original[0].body.start] !== '{' ||
        emittedSource[generated[0].body.start] !== '{'
      )
        return
      const body = mappings.filter((mapping) =>
        same(generated[0].body.loc.start, mapping.generated)
      )
      if (body.length) {
        if (
          body.length !== 1 ||
          body[0].source !== file ||
          !same(original[0].body.loc.start, body[0].original)
        )
          return
      } else
        additions.push({
          generated: generated[0].body.loc.start,
          original: original[0].body.loc.start,
        })
    }
    if (unusedAuthored.size || unusedEmitted.size) return
    additions.push(...(jsx?.reportMappings ?? []))
    const generator = SourceMapGenerator.fromSourceMap(
      new SourceMapConsumer(map as unknown as RawSourceMap)
    )
    for (const mapping of additions)
      generator.addMapping({ ...mapping, source: file })
    const associated = JSON.parse(
      generator.toString()
    ) as CompilerTransformSourceMap
    const after = roles(associated)
    if (
      after.length !== mappings.length + additions.length ||
      !mappings.every((mapping) =>
        after.some((candidate) => isDeepStrictEqual(mapping, candidate))
      ) ||
      !isDeepStrictEqual(associated.sourcesContent, map.sourcesContent)
    )
      return
    return { ...structuredClone(rawCoverage), inputSourceMap: associated }
  } catch {
    return
  }
}
