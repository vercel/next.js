import { decodeCoverageMap } from './maps'
import type { ArrowBindingAssociation } from './arrow-bindings'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = StandardCoverageLocation['start']
type Node = {
  type: string
  loc: StandardCoverageLocation
  start?: number
  end?: number
  name?: string
  value?: unknown
  raw?: string
  callee?: Node
  arguments?: Node[]
  test?: Node
  consequent?: Node
  alternate?: Node
}
const same = (a: Partial<Point> | undefined, b: Partial<Point> | undefined) =>
  !!a &&
  !!b &&
  typeof a.line === 'number' &&
  typeof a.column === 'number' &&
  a.line === b.line &&
  a.column === b.column
function visit(
  value: unknown,
  run: (node: Node, parent?: Node) => void,
  parent?: Node
): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) visit(child, run, parent)
    return
  }
  const node = value as Node
  if (node.type) run(node, parent)
  for (const [key, child] of Object.entries(value))
    if (!['loc', 'comments', 'tokens'].includes(key)) visit(child, run, node)
}
const key = (branch: StandardCoverageData['branchMap'][string]) =>
  `b:${branch.locations
    .flatMap(({ start, end }) => [
      start.line,
      start.column,
      end.line,
      end.column,
    ])
    .map(String)
    .join(':')}`

/** Bind a terminal literal only inside an already qualified native constructor executor. */
export function bindConstructorConditionalEnds(
  file: string,
  data: StandardCoverageData,
  authored: unknown,
  associations: readonly ArrowBindingAssociation[],
  sourceMap: unknown
): void {
  const mappings = decodeCoverageMap(sourceMap).mappings
  const exact = (generated: Point, original: Point) => {
    const found = mappings.filter((mapping) =>
      same(
        { line: mapping.generatedLine, column: mapping.generatedColumn },
        generated
      )
    )
    return (
      found.length > 0 &&
      found.every(
        (mapping) =>
          mapping.source === file &&
          same(
            { line: mapping.originalLine!, column: mapping.originalColumn! },
            original
          )
      )
    )
  }
  const constructors = new Set<unknown>()
  visit(authored, (node, parent) => {
    if (
      node.type === 'ArrowFunctionExpression' &&
      parent?.type === 'NewExpression' &&
      parent.callee?.type === 'Identifier' &&
      parent.callee.name === 'Promise' &&
      parent.arguments?.[0] === node
    )
      constructors.add(node)
  })
  const usedBranches = new Set<string>()
  const repairs: {
    branch: StandardCoverageData['branchMap'][string]
    end: Point
    before: string
    after: string
    id: number
  }[] = []
  for (const association of associations) {
    if (!constructors.has(association.original)) continue
    const original = association.original.body as Node | undefined,
      generated = association.generated.body as Node | undefined,
      node = original?.arguments?.[0]
    // This measured terminal is the sole conditional argument to the executor's
    // direct call. Nested functions, block bodies and other operands stay closed.
    if (
      original?.type !== 'CallExpression' ||
      original.callee?.type !== 'Identifier' ||
      association.original.params?.length !== 1 ||
      association.original.params[0].type !== 'Identifier' ||
      association.original.params[0].name !== original.callee.name ||
      original.arguments?.length !== 1 ||
      node?.type !== 'ConditionalExpression' ||
      node.test?.type !== 'Identifier' ||
      node.consequent?.type !== 'Literal' ||
      typeof node.consequent.value !== 'string' ||
      node.alternate?.type !== 'Literal' ||
      typeof node.alternate.value !== 'string'
    )
      continue
    const fail = (): never => {
      throw new Error(
        `Standard coverage constructor conditional endpoint is ambiguous or absent: ${file}:${node.loc.start.line}:${node.loc.start.column}`
      )
    }
    const literal = (left: Node, right: Node | undefined) =>
      right?.type === 'Literal' &&
      typeof left.raw === 'string' &&
      left.raw === right.raw &&
      left.value === right.value &&
      Number.isSafeInteger(left.start) &&
      Number.isSafeInteger(left.end) &&
      Number.isSafeInteger(right.start) &&
      Number.isSafeInteger(right.end) &&
      left.end === left.start! + left.raw.length &&
      right.end === right.start! + left.raw.length &&
      left.loc.start.line === left.loc.end.line &&
      right.loc.start.line === right.loc.end.line &&
      left.loc.end.column - left.loc.start.column === left.raw.length &&
      right.loc.end.column - right.loc.start.column === left.raw.length &&
      exact(right.loc.start, left.loc.start)
    const other = generated?.arguments?.[0]
    const originalMatches: Node[] = []
    visit(original, (candidate) => {
      if (
        candidate.type === 'ConditionalExpression' &&
        same(candidate.loc.start, node.loc.start)
      )
        originalMatches.push(candidate)
    })
    const matches: Node[] = []
    visit(association.generated.body, (candidate) => {
      if (
        candidate.type === 'ConditionalExpression' &&
        exact(candidate.loc.start, node.loc.start)
      )
        matches.push(candidate)
    })
    if (
      !association.callback ||
      association.original.async ||
      generated?.type !== 'CallExpression' ||
      generated.callee?.type !== 'Identifier' ||
      generated.callee.name !== original.callee.name ||
      generated.arguments?.length !== 1 ||
      other?.type !== 'ConditionalExpression' ||
      other.test?.type !== 'Identifier' ||
      other.test.name !== node.test.name ||
      originalMatches.length !== 1 ||
      originalMatches[0] !== node ||
      matches.length !== 1 ||
      matches[0] !== other ||
      !same(association.callbackEnd, original.loc.end) ||
      !same(node.loc.end, node.alternate.loc.end) ||
      !same(other.loc.end, other.alternate?.loc.end) ||
      !exact(generated.callee.loc.start, original.callee.loc.start) ||
      !exact(other.loc.start, node.loc.start) ||
      !exact(other.test.loc.start, node.test.loc.start) ||
      !literal(node.consequent, other.consequent) ||
      !literal(node.alternate, other.alternate)
    )
      fail()
    const candidates = Object.entries(data.branchMap).filter(
      ([, branch]) =>
        branch.type === 'cond-expr' &&
        same(branch.loc.start, node.loc.start) &&
        branch.locations.length === 2 &&
        same(branch.locations[0].start, node.consequent!.loc.start) &&
        same(branch.locations[0].end, node.alternate!.loc.start) &&
        same(branch.locations[1].start, node.alternate!.loc.start)
    )
    if (candidates.length !== 1) fail()
    const [id, branch] = candidates[0],
      end = node.alternate.loc.end
    if (usedBranches.has(id)) fail()
    usedBranches.add(id)
    const terminal = (point: Partial<Point>) =>
      point.line === end.line &&
      (point.column === Infinity || point.column === end.column)
    if (
      !terminal(branch.loc.end) ||
      !terminal(branch.locations[1].end) ||
      !same(branch.loc.end, branch.locations[1].end) ||
      data.b[id]?.length !== 2
    )
      fail()
    const before = key(branch),
      copy = structuredClone(branch)
    copy.loc.end = { ...end }
    copy.locations[1].end = { ...end }
    const after = key(copy)
    if (
      data.meta &&
      (data.meta.seen[before] !== Number(id) ||
        (before !== after && Object.hasOwn(data.meta.seen, after)))
    )
      fail()
    repairs.push({ branch, end: { ...end }, before, after, id: Number(id) })
  }
  for (const { branch, end, before, after, id } of repairs) {
    branch.loc.end = { ...end }
    branch.locations[1].end = { ...end }
    if (data.meta) {
      delete data.meta.seen[before]
      data.meta.seen[after] = id
    }
  }
}
