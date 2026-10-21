import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = StandardCoverageLocation['start']
type Node = {
  type: string
  loc: StandardCoverageLocation
  body?: Node[]
  test?: Node
  consequent?: Node
  alternate?: Node | null
  argument?: Node
}
const same = (a: Partial<Point> | undefined, b: Partial<Point> | undefined) =>
  !!a &&
  !!b &&
  typeof a.line === 'number' &&
  typeof a.column === 'number' &&
  a.line === b.line &&
  a.column === b.column
const empty = (point: Partial<Point>) =>
  point.line === undefined && point.column === undefined
function pairs(tree: unknown): { node: Node; next: Node }[] {
  const result: { node: Node; next: Node }[] = []
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    const node = value as Node
    if (node.type === 'BlockStatement' && Array.isArray(node.body))
      for (let index = 0; index + 1 < node.body.length; index++) {
        const current = node.body[index],
          next = node.body[index + 1]
        if (
          current.type === 'IfStatement' &&
          !current.alternate &&
          current.consequent?.type === 'ReturnStatement' &&
          current.consequent.argument &&
          next.type === 'ReturnStatement' &&
          next.argument
        )
          result.push({ node: current, next })
      }
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(tree)
  return result
}
const key = (
  locations: StandardCoverageData['branchMap'][string]['locations']
) =>
  `b:${locations
    .flatMap(({ start, end }) => [
      start.line,
      start.column,
      end.line,
      end.column,
    ])
    .map(String)
    .join(':')}`

/** Restore a borrowed next-return endpoint only through the actual paired AST/map roles. */
export function bindIfReturnEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: RawSourceMap
): void {
  const consumer = new SourceMapConsumer(sourceMap)
  const mappings: {
    generated: Point
    source: string | null
    original: Point
  }[] = []
  consumer.eachMapping((mapping) =>
    mappings.push({
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      source: mapping.source,
      original: { line: mapping.originalLine, column: mapping.originalColumn },
    })
  )
  const exact = (point: Point, original: Point) => {
    const found = mappings.filter((mapping) => same(mapping.generated, point))
    return (
      found.length > 0 &&
      found.every(
        (mapping) => mapping.source === file && same(mapping.original, original)
      )
    )
  }
  const generatedPairs = pairs(emitted)
  const repairs: {
    branch: StandardCoverageData['branchMap'][string]
    end: Point
    before: string
    after: string
    id: number
  }[] = []
  for (const { node, next } of pairs(authored)) {
    const found = Object.entries(observed.branchMap).filter(
      ([, branch]) =>
        branch.type === 'if' &&
        same(branch.loc.start, node.loc.start) &&
        same(branch.loc.end, next.loc.start) &&
        branch.locations.length === 2 &&
        same(branch.locations[0].start, node.loc.start) &&
        same(branch.locations[0].end, next.loc.start) &&
        empty(branch.locations[1].start) &&
        empty(branch.locations[1].end)
    )
    if (!found.length) continue
    const fail = (): never => {
      throw new Error(
        `Standard coverage if-return endpoint association is ambiguous or absent: ${file}:${node.loc.start.line}:${node.loc.start.column}`
      )
    }
    if (found.length !== 1) fail()
    const [id, branch] = found[0]
    const originals = Object.values(model.branchMap).filter(
      (item) =>
        item.type === 'if' &&
        same(item.loc.start, node.loc.start) &&
        same(item.loc.end, node.loc.end) &&
        item.locations.length === 2 &&
        same(item.locations[0].start, node.loc.start) &&
        same(item.locations[0].end, node.loc.end) &&
        empty(item.locations[1].start) &&
        empty(item.locations[1].end)
    )
    const generated = generatedPairs.filter(
      ({ node: candidate, next: following }) =>
        candidate.test?.type === node.test?.type &&
        candidate.consequent?.argument?.type ===
          node.consequent?.argument?.type &&
        following.argument?.type === next.argument?.type &&
        exact(candidate.loc.start, node.loc.start) &&
        exact(candidate.test!.loc.start, node.test!.loc.start) &&
        exact(candidate.consequent!.loc.start, node.consequent!.loc.start) &&
        exact(
          candidate.consequent!.argument!.loc.start,
          node.consequent!.argument!.loc.start
        ) &&
        exact(following.loc.start, next.loc.start) &&
        exact(following.argument!.loc.start, next.argument!.loc.start)
    )
    if (originals.length !== 1 || generated.length !== 1) fail()
    const before = key(branch.locations),
      after = key(originals[0].locations)
    if (
      observed.meta &&
      (observed.meta.seen[before] !== Number(id) ||
        (Object.hasOwn(observed.meta.seen, after) && before !== after))
    )
      fail()
    repairs.push({
      branch,
      end: { ...node.loc.end },
      before,
      after,
      id: Number(id),
    })
  }
  for (const { branch, end, before, after, id } of repairs) {
    branch.loc.end = { ...end }
    branch.locations[0].end = { ...end }
    if (observed.meta) {
      delete observed.meta.seen[before]
      observed.meta.seen[after] = id
    }
  }
}
