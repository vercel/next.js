import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import type { StandardCoverageData, StandardCoverageLocation } from './types'
import { browserJsxChildKey } from './browser-jsx-associations'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc: StandardCoverageLocation
  name?: string
  value?: unknown
  test?: Node
  consequent?: Node
  alternate?: Node
  openingElement?: { name?: Node }
  arguments?: Node[]
}
const same = (a: Partial<Point> | undefined, b: Partial<Point> | undefined) =>
  !!a &&
  !!b &&
  typeof a.line === 'number' &&
  typeof a.column === 'number' &&
  a.line === b.line &&
  a.column === b.column

function visit(value: unknown, callback: (node: Node) => void): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) visit(child, callback)
    return
  }
  const node = value as Node
  if (node.type) callback(node)
  for (const [key, child] of Object.entries(value))
    if (!['loc', 'comments', 'tokens'].includes(key)) visit(child, callback)
}

/** Associate a lowered JSX branch boundary with the actual next tag mapping. */
export function bindJsxConditionalEnds(
  file: string,
  data: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: RawSourceMap,
  browserJsxChildren?: ReadonlySet<string>
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
  const exact = (point: Point): Point | undefined => {
    const found = mappings.filter((mapping) => same(mapping.generated, point))
    if (
      !found.length ||
      found.some(
        (mapping) =>
          mapping.source !== file || !same(mapping.original, found[0].original)
      )
    )
      return
    return found[0].original
  }
  const conditionals: Node[] = []
  visit(emitted, (node) => {
    if (node.type === 'ConditionalExpression') conditionals.push(node)
  })
  const authoredConditionals: Node[] = []
  visit(authored, (node) => {
    if (node.type === 'ConditionalExpression') authoredConditionals.push(node)
  })
  const repairs: {
    location: StandardCoverageData['branchMap'][string]['locations'][number]
    end: Point
  }[] = []
  for (const node of authoredConditionals) {
    if (browserJsxChildren?.has(browserJsxChildKey(node))) continue
    if (
      node.type !== 'ConditionalExpression' ||
      node.test?.type !== 'Identifier' ||
      node.consequent?.type !== 'JSXElement' ||
      node.alternate?.type !== 'JSXElement'
    )
      continue
    const consequent = node.consequent
    const alternate = node.alternate
    const branches = Object.values(data.branchMap).filter(
      (branch) =>
        branch.type === 'cond-expr' &&
        same(branch.loc.start, node.loc.start) &&
        branch.locations.length === 2 &&
        same(branch.locations[0].start, consequent.loc.start) &&
        same(branch.locations[1].start, alternate.loc.start)
    )
    if (
      branches.length !== 1 ||
      !same(branches[0].locations[0].end, alternate.loc.start)
    )
      continue
    const fail = (): never => {
      throw new Error(
        `Standard coverage JSX branch association is ambiguous or absent: ${file}:${node.loc.start.line}:${node.loc.start.column}`
      )
    }
    if (
      authoredConditionals.filter((other) =>
        same(other.loc.start, node.loc.start)
      ).length !== 1
    )
      fail()
    const firstTag = consequent.openingElement?.name
    const nextTag = alternate.openingElement?.name
    if (firstTag?.type !== 'JSXIdentifier' || nextTag?.type !== 'JSXIdentifier')
      continue
    const matches = conditionals.filter(
      (generated) =>
        generated.test?.type === 'Identifier' &&
        same(exact(generated.test.loc.start), node.test!.loc.start) &&
        generated.consequent?.type === 'CallExpression' &&
        generated.alternate?.type === 'CallExpression' &&
        same(exact(generated.consequent.loc.start), consequent.loc.start) &&
        same(exact(generated.alternate.loc.start), alternate.loc.start)
    )
    if (matches.length !== 1) fail()
    const firstArgument = matches[0].consequent!.arguments?.[0]
    const nextArgument = matches[0].alternate!.arguments?.[0]
    if (
      firstArgument?.type !== 'Literal' ||
      nextArgument?.type !== 'Literal' ||
      firstArgument.value !== firstTag.name ||
      nextArgument.value !== nextTag.name ||
      !same(exact(firstArgument.loc.start), firstTag.loc.start) ||
      !same(exact(nextArgument.loc.start), nextTag.loc.start)
    )
      fail()
    repairs.push({
      location: branches[0].locations[0],
      end: exact(nextArgument!.loc.start)!,
    })
  }
  for (const { location, end } of repairs) location.end = { ...end }
}
