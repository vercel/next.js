import { isDeepStrictEqual } from 'util'
import { decodeCoverageMap } from './maps'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = StandardCoverageLocation['start']
type Node = {
  type: string
  loc: StandardCoverageLocation
  body?: Node | Node[]
  declaration?: Node
  declarations?: Node[]
  properties?: Node[]
  id?: Node
  init?: Node
  key?: Node
  value?: Node
  argument?: Node
  kind?: string
  method?: boolean
  computed?: boolean
  async?: boolean
  generator?: boolean
}
const same = (a: Point | undefined, b: Point | undefined) =>
  !!a && !!b && a.line === b.line && a.column === b.column
function semantic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semantic)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !['loc', 'start', 'end', 'raw', 'comments', 'tokens'].includes(key)
      )
      .map(([key, child]) => [key, semantic(child)])
  )
}
function declarations(tree: unknown): Node[] {
  const result: Node[] = []
  function visit(value: unknown, parent?: Node) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value))
      return value.forEach((child) => visit(child, parent))
    const node = value as Node
    if (
      node.type === 'VariableDeclarator' &&
      parent?.type === 'VariableDeclaration' &&
      parent.kind === 'const' &&
      parent.declarations?.length === 1 &&
      node.id?.type === 'Identifier' &&
      node.init?.type === 'ObjectExpression'
    )
      result.push(node)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child, node)
  }
  visit(tree)
  return result
}

function singleReturn(property: Node): Node | undefined {
  const value = property.value,
    body = value?.body
  if (
    property.type === 'Property' &&
    property.method === true &&
    !property.computed &&
    property.kind === 'init' &&
    value?.type === 'FunctionExpression' &&
    !value.async &&
    !value.generator &&
    body &&
    !Array.isArray(body) &&
    body.type === 'BlockStatement' &&
    Array.isArray(body.body) &&
    body.body.length === 1 &&
    body.body[0].type === 'ReturnStatement' &&
    body.body[0].argument
  )
    return body.body[0]
}

/** A lowered const initializer cannot add an authored export-default counter. */
export function bindDefaultObjectInitializer(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown
): StandardCoverageData {
  const program = authored as Node | undefined
  const defaults =
    program?.type === 'Program' && Array.isArray(program.body)
      ? (program.body.filter(
          (node) => node.type === 'ExportDefaultDeclaration'
        ) ?? [])
      : []
  if (
    defaults.length !== 1 ||
    defaults[0].declaration?.type !== 'ObjectExpression'
  )
    return observed
  const object = defaults[0].declaration
  const properties = object.properties
  if (
    !properties?.length ||
    !properties.every((property) => singleReturn(property))
  )
    return observed
  const extra = Object.entries(observed.statementMap).filter(([, location]) =>
    same(location.start, object.loc.start)
  )
  if (!extra.length) return observed
  const fail = (): never => {
    throw new Error(
      `Standard coverage default-object initializer association is ambiguous or absent: ${file}`
    )
  }
  if (
    extra.length !== 1 ||
    Object.values(model.statementMap).some((location) =>
      same(location.start, object.loc.start)
    )
  )
    fail()
  const [id, location] = extra[0]
  if (
    location.end.line !== object.loc.end.line ||
    location.end.column !== Infinity ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) < 0 ||
    !Number.isSafeInteger(observed.s[id]) ||
    observed.s[id] < 0 ||
    !observed.meta ||
    observed.meta.seen[
      `s:${location.start.line}:${location.start.column}:${location.end.line}:${location.end.column}`
    ] !== Number(id)
  )
    fail()
  const candidates = declarations(emitted).filter((node) =>
    isDeepStrictEqual(semantic(node.init), semantic(object))
  )
  if (candidates.length !== 1) fail()
  const generated = candidates[0].init!
  const mappings = decodeCoverageMap(sourceMap).mappings
  const exact = (point: Point, original: Point) => {
    const found = mappings.filter(
      (mapping) =>
        mapping.generatedLine === point.line &&
        mapping.generatedColumn === point.column
    )
    return (
      found.length > 0 &&
      found.every(
        (mapping) =>
          mapping.source === file &&
          mapping.originalLine === original.line &&
          mapping.originalColumn === original.column
      )
    )
  }
  const close = (node: Node) => ({
    line: node.loc.end.line,
    column: node.loc.end.column - 1,
  })
  if (
    !exact(generated.loc.start, object.loc.start) ||
    !exact(close(generated), close(object))
  )
    fail()
  for (let index = 0; index < properties.length; index++) {
    const original = properties[index],
      target = generated.properties![index]
    if (
      !exact(target.key!.loc.start, original.key!.loc.start) ||
      !exact(singleReturn(target)!.loc.start, singleReturn(original)!.loc.start)
    )
      fail()
  }
  const statementMap = { ...observed.statementMap },
    s = { ...observed.s }
  delete statementMap[id]
  delete s[id]
  return { ...observed, statementMap, s }
}
