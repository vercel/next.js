import { SourceMapGenerator } from 'next/dist/compiled/source-map'
import { decodeCoverageMap, type CoverageMapping } from './maps'
import type { StandardCoverageData } from './types'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc: { start: Point; end: Point }
  id?: Node
  init?: Node
  body?: Node
  params?: Node[]
  name?: string
  async?: boolean
}
export interface ArrowBindingAssociation {
  original: Node
  generated: Node
  start: Point
}
const same = (a: Point, b: Point) => a.line === b.line && a.column === b.column
const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
const generated = (mapping: CoverageMapping): Point => ({
  line: mapping.generatedLine,
  column: mapping.generatedColumn,
})
const original = (mapping: CoverageMapping): Point => ({
  line: mapping.originalLine!,
  column: mapping.originalColumn!,
})
function walk(
  value: unknown,
  visit: (node: Node, parent?: Node) => void,
  parent?: Node
) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parent)
    return
  }
  const node = value as Node
  if (typeof node.type === 'string') visit(node, parent)
  for (const [key, child] of Object.entries(value))
    if (!['loc', 'comments', 'tokens'].includes(key)) walk(child, visit, node)
}

/** Link actual emitted bindings to authored arrows before changing display roles. */
export function associateArrowBindings(
  file: string,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown
): ArrowBindingAssociation[] {
  const mappings = decodeCoverageMap(sourceMap).mappings
  const declarations: { binding: Node; arrow: Node }[] = []
  function failure(node: Node): never {
    throw new Error(
      `TypeScript arrow-function coverage requires compiler-qualified binding maps: ${file}:${node.loc.start.line}:${node.loc.start.column}`
    )
  }
  walk(authored, (arrow, parent) => {
    if (arrow.type !== 'ArrowFunctionExpression') return
    if (
      parent?.type !== 'VariableDeclarator' ||
      parent.init !== arrow ||
      parent.id?.type !== 'Identifier'
    )
      failure(arrow)
    declarations.push({ binding: parent.id, arrow })
  })
  if (!declarations.length) return []
  const exact = (point: Point) => {
    const values = mappings.filter((mapping) => same(generated(mapping), point))
    if (!values.length || values.some((mapping) => mapping.source !== file))
      return undefined
    const position = original(values[0])
    return values.every((mapping) => same(original(mapping), position))
      ? position
      : undefined
  }
  const emittedDeclarations: { binding: Node; arrow: Node }[] = []
  walk(emitted, (arrow, parent) => {
    if (
      arrow.type === 'ArrowFunctionExpression' &&
      parent?.type === 'VariableDeclarator' &&
      parent.init === arrow &&
      parent.id?.type === 'Identifier'
    )
      emittedDeclarations.push({ binding: parent.id, arrow })
  })
  const used = new Set<Node>()
  return declarations.map(({ binding, arrow }) => {
    const candidates = emittedDeclarations.filter((value) => {
      const point = exact(value.binding.loc.start)
      return point && same(point, binding.loc.start)
    })
    if (candidates.length !== 1 || used.has(candidates[0].arrow)) failure(arrow)
    const candidate = candidates[0].arrow
    used.add(candidate)
    const start = exact(candidate.loc.start)
    if (
      !start ||
      !same(start, arrow.loc.start) ||
      candidate.async !== arrow.async ||
      !arrow.body ||
      !candidate.body ||
      candidate.params?.length !== arrow.params?.length
    )
      failure(arrow)
    for (let index = 0; index < arrow.params!.length; index++) {
      const point = exact(candidate.params![index].loc.start)
      if (!point || !same(point, arrow.params![index].loc.start)) failure(arrow)
    }
    const body = mappings.filter(
      (mapping) =>
        compare(generated(mapping), candidate.body!.loc.start) >= 0 &&
        compare(generated(mapping), candidate.body!.loc.end) < 0 &&
        mapping.source !== null
    )
    if (
      !body.length ||
      body.some(
        (mapping) =>
          mapping.source !== file ||
          compare(original(mapping), arrow.body!.loc.start) < 0 ||
          compare(original(mapping), arrow.body!.loc.end) >= 0
      )
    )
      failure(arrow)
    // The async keyword is an actual emitted prefix. Non-async variable arrows
    // use their uniquely associated binding as the initialization display role.
    return {
      original: arrow,
      generated: candidate,
      start: arrow.async ? arrow.loc.start : binding.loc.start,
    }
  })
}

/** The coverage role map is separate from the retained stack/error source map. */
export function arrowBindingMap(
  file: string,
  sourceMap: object,
  associations: ArrowBindingAssociation[]
): object {
  if (!associations.length) return sourceMap
  const decoded = decodeCoverageMap(sourceMap)
  const map = new SourceMapGenerator()
  for (const mapping of decoded.mappings) {
    const association = associations.find((value) =>
      same(value.generated.loc.start, generated(mapping))
    )
    const point = association?.start ?? original(mapping)
    const position = { generated: generated(mapping) }
    if (mapping.source === null) {
      ;(map.addMapping as (mapping: typeof position) => void)(position)
    } else {
      if (association && mapping.source !== file)
        throw new Error('Arrow binding map crosses its original source')
      map.addMapping({ ...position, source: mapping.source, original: point })
    }
  }
  for (const [source, content] of decoded.sources)
    if (content !== null) map.setSourceContent(source, content)
  return JSON.parse(map.toString())
}

/** Change descriptors only after preserving all actual V8 counter identities. */
export function bindOriginalArrowLocations(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  associations: ArrowBindingAssociation[]
): void {
  const usedFunctions = new Set<string>(),
    usedStatements = new Set<string>(),
    usedObservedFunctions = new Set<string>()
  for (const association of associations) {
    const start = association.original.loc.start
    const functions = Object.entries(model.fnMap).filter(([, fn]) =>
      same(fn.decl.start as Point, start)
    )
    const statements = Object.entries(model.statementMap).filter(
      ([, location]) => same(location.start as Point, start)
    )
    const actual = Object.entries(observed.fnMap).filter(([, fn]) =>
      same(fn.decl.start as Point, association.start)
    )
    if (
      functions.length !== 1 ||
      statements.length !== 1 ||
      actual.length !== 1 ||
      usedFunctions.has(functions[0][0]) ||
      usedStatements.has(statements[0][0]) ||
      usedObservedFunctions.has(actual[0][0]) ||
      actual[0][1].loc.end.line !== functions[0][1].loc.end.line
    )
      throw new Error(
        `Standard coverage arrow binding association is ambiguous or absent: ${file}:${start.line}:${start.column}`
      )
    usedFunctions.add(functions[0][0])
    usedStatements.add(statements[0][0])
    usedObservedFunctions.add(actual[0][0])
    functions[0][1].decl.start = association.start
    // Retain the actual emitted range endpoint, including the next binding's
    // mapped boundary for multiple declarations on one line.
    functions[0][1].loc.end = actual[0][1].loc.end
    statements[0][1].start = association.start
  }
}
