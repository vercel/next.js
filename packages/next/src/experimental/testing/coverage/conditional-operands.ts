import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = StandardCoverageLocation['start']
type Node = {
  type: string
  loc: StandardCoverageLocation
  operator?: string
  value?: unknown
  test?: Node
  consequent?: Node
  alternate?: Node
  left?: Node
  right?: Node
}
const same = (a: Partial<Point> | undefined, b: Partial<Point> | undefined) =>
  !!a &&
  !!b &&
  typeof a.line === 'number' &&
  typeof a.column === 'number' &&
  a.line === b.line &&
  a.column === b.column
function conditionals(tree: unknown): Node[] {
  const result: Node[] = []
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    const node = value as Node
    if (node.type === 'ConditionalExpression') result.push(node)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(tree)
  return result
}
function measuredRoles(node: Node) {
  const test = node.test,
    consequent = node.consequent,
    alternate = node.alternate
  if (
    test?.type !== 'BinaryExpression' ||
    consequent?.type !== 'BinaryExpression' ||
    test.right?.type !== 'Literal' ||
    typeof test.right.value !== 'number' ||
    consequent.right?.type !== 'Literal' ||
    typeof consequent.right.value !== 'number' ||
    alternate?.type !== 'Literal' ||
    typeof alternate.value !== 'number' ||
    !same(consequent.loc.end, consequent.right.loc.end)
  )
    return
  return {
    test,
    consequent,
    alternate,
    testRight: test.right,
    terminal: consequent.right,
  }
}
const branchKey = (branch: StandardCoverageData['branchMap'][string]) =>
  `b:${branch.locations
    .flatMap(({ start, end }) => [
      start.line,
      start.column,
      end.line,
      end.column,
    ])
    .map(String)
    .join(':')}`

/** A binary consequent's terminal cannot borrow the following alternate's start. */
export function bindConditionalOperandEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: RawSourceMap
): void {
  const mappings: {
    generated: Point
    source: string | null
    original: Point
  }[] = []
  new SourceMapConsumer(sourceMap).eachMapping((mapping) =>
    mappings.push({
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      source: mapping.source,
      original: { line: mapping.originalLine, column: mapping.originalColumn },
    })
  )
  const exact = (generated: Point, original: Point) => {
    const matches = mappings.filter((mapping) =>
      same(mapping.generated, generated)
    )
    return (
      matches.length > 0 &&
      matches.every(
        (mapping) => mapping.source === file && same(mapping.original, original)
      )
    )
  }
  const authoredNodes = conditionals(authored)
  const generated = conditionals(emitted)
  const repairs: {
    branch: StandardCoverageData['branchMap'][string]
    end: Point
    before: string
    after: string
    id: number
  }[] = []
  for (const node of authoredNodes) {
    const roles = measuredRoles(node)
    if (!roles) continue
    const candidates = Object.entries(observed.branchMap).filter(
      ([, branch]) =>
        branch.type === 'cond-expr' &&
        same(branch.loc.start, node.loc.start) &&
        branch.locations.length === 2 &&
        same(branch.locations[0].start, roles.consequent.loc.start) &&
        same(branch.locations[0].end, roles.alternate.loc.start) &&
        same(branch.locations[1].start, roles.alternate.loc.start)
    )
    if (!candidates.length) continue
    const fail = (): never => {
      throw new Error(
        `Standard coverage conditional operand association is ambiguous or absent: ${file}:${node.loc.start.line}:${node.loc.start.column}`
      )
    }
    if (
      candidates.length !== 1 ||
      authoredNodes.filter((other) => same(other.loc.start, node.loc.start))
        .length !== 1
    )
      fail()
    const [id, branch] = candidates[0]
    const originals = Object.values(model.branchMap).filter(
      (original) =>
        original.type === 'cond-expr' &&
        same(original.loc.start, node.loc.start) &&
        same(original.loc.end, branch.loc.end) &&
        original.locations.length === 2 &&
        same(original.locations[0].start, roles.consequent.loc.start) &&
        same(original.locations[0].end, roles.consequent.loc.end) &&
        same(original.locations[1].start, branch.locations[1].start) &&
        same(original.locations[1].end, branch.locations[1].end)
    )
    const associated = generated.filter((candidate) => {
      const other = measuredRoles(candidate)
      return (
        other &&
        other.test.operator === roles.test.operator &&
        other.consequent.operator === roles.consequent.operator &&
        other.testRight.value === roles.testRight.value &&
        other.terminal.value === roles.terminal.value &&
        other.alternate.value === roles.alternate.value &&
        exact(candidate.loc.start, node.loc.start) &&
        exact(other.test.loc.start, roles.test.loc.start) &&
        exact(other.testRight.loc.start, roles.testRight.loc.start) &&
        exact(other.consequent.loc.start, roles.consequent.loc.start) &&
        exact(other.terminal.loc.start, roles.terminal.loc.start) &&
        exact(other.alternate.loc.start, roles.alternate.loc.start)
      )
    })
    if (originals.length !== 1 || associated.length !== 1) fail()
    const before = branchKey(branch),
      after = branchKey(originals[0])
    if (
      observed.meta &&
      (observed.meta.seen[before] !== Number(id) ||
        (Object.hasOwn(observed.meta.seen, after) && before !== after))
    )
      fail()
    repairs.push({
      branch,
      end: { ...roles.consequent.loc.end },
      before,
      after,
      id: Number(id),
    })
  }
  for (const { branch, end, before, after, id } of repairs) {
    branch.locations[0].end = { ...end }
    if (observed.meta) {
      delete observed.meta.seen[before]
      observed.meta.seen[after] = id
    }
  }
}
