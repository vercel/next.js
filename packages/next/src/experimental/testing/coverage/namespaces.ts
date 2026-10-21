import { decodeCoverageMap } from './maps'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc: { start: Point; end: Point }
  start: number
  end: number
  name?: string
  kind?: string
  declare?: boolean
  async?: boolean
  generator?: boolean
  computed?: boolean
  operator?: string
  value?: unknown
  id?: Node
  body?: Node | Node[]
  declaration?: Node
  declarations?: Node[]
  params?: Node[]
  arguments?: Node[]
  properties?: Node[]
  callee?: Node
  expression?: Node
  object?: Node
  property?: Node
  left?: Node
  right?: Node
  init?: Node
}
const same = (a: Partial<Point> | undefined, b: Partial<Point> | undefined) =>
  !!a && !!b && a.line === b.line && a.column === b.column
function nodes(tree: unknown): Node[] {
  const result: Node[] = []
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (typeof (value as Node).type === 'string') result.push(value as Node)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(tree)
  return result
}
const body = (node: Node | undefined) =>
  Array.isArray(node?.body) ? node.body : []

/** Bind actual namespace IIFEs and compiler-only function publication writes. */
export function bindNamespaceModel(
  file: string,
  source: string,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown,
  original: StandardCoverageData,
  observed: StandardCoverageData
) {
  const owners = nodes(authored).filter(
    (node) => node.type === 'TSModuleDeclaration'
  )
  if (!owners.length) return { original, observed }
  const owner = owners[0]
  function fail(): never {
    throw new Error(
      `Standard coverage cannot associate generated TSModuleDeclaration bodies: ${file}:${owner.loc.start.line}:${owner.loc.start.column}`
    )
  }
  const block = owner.body as Node
  if (
    owners.length !== 1 ||
    owner.kind !== 'namespace' ||
    owner.declare ||
    owner.id?.type !== 'Identifier' ||
    !owner.id.name ||
    block?.type !== 'TSModuleBlock' ||
    source.slice(owner.start, owner.id.start).trim() !== 'namespace' ||
    source[owner.end - 1] !== '}' ||
    !original.meta ||
    !observed.meta
  )
    fail()
  const mappings = decodeCoverageMap(sourceMap).mappings
  function exact(generated: Point, point: Point) {
    const found = mappings.filter(
      (mapping) =>
        mapping.generatedLine === generated.line &&
        mapping.generatedColumn === generated.column
    )
    return (
      found.length > 0 &&
      found.every(
        (mapping) =>
          mapping.source === file &&
          mapping.originalLine === point.line &&
          mapping.originalColumn === point.column
      )
    )
  }
  const actualNodes = nodes(emitted)
  const functions = actualNodes.filter(
    (node) =>
      node.type === 'FunctionExpression' &&
      !node.async &&
      !node.generator &&
      node.params?.length === 1 &&
      node.params[0].type === 'Identifier' &&
      node.params[0].name === owner.id!.name &&
      exact(node.params[0].loc.start, owner.id!.loc.start)
  )
  if (functions.length !== 1) fail()
  const fn = functions[0]
  const generatedBody = fn.body as Node
  const calls = actualNodes.filter(
    (node) => node.type === 'CallExpression' && node.callee === fn
  )
  const argument = calls[0]?.arguments?.[0]
  if (
    generatedBody?.type !== 'BlockStatement' ||
    calls.length !== 1 ||
    calls[0].arguments?.length !== 1 ||
    argument?.type !== 'LogicalExpression' ||
    argument.operator !== '||' ||
    argument.left?.type !== 'Identifier' ||
    argument.left.name !== owner.id!.name ||
    argument.right?.type !== 'AssignmentExpression' ||
    argument.right.operator !== '=' ||
    argument.right.left?.type !== 'Identifier' ||
    argument.right.left.name !== owner.id!.name ||
    argument.right.right?.type !== 'ObjectExpression' ||
    argument.right.right.properties?.length !== 0 ||
    !exact(argument.left.loc.start, owner.id!.loc.start) ||
    !exact(argument.right.left.loc.start, owner.id!.loc.start) ||
    !exact(
      {
        line: generatedBody.loc.end.line,
        column: generatedBody.loc.end.column - 1,
      },
      { line: block.loc.end.line, column: block.loc.end.column - 1 }
    )
  )
    fail()
  const nextOriginal = structuredClone(original)
  const nextObserved = structuredClone(observed)
  const namespaceStatements = Object.entries(observed.statementMap).filter(
    ([, location]) => same(location.start, owner.id!.loc.start)
  )
  const namespaceFunctions = Object.entries(observed.fnMap).filter(
    ([, value]) => same(value.decl.start, owner.id!.loc.start)
  )
  const namespaceBranches = Object.entries(observed.branchMap).filter(
    ([, value]) =>
      value.type === 'binary-expr' &&
      same(value.loc.start, owner.id!.loc.start) &&
      value.locations.length === 2
  )
  if (
    namespaceStatements.length !== 1 ||
    namespaceFunctions.length !== 1 ||
    namespaceBranches.length !== 1 ||
    !same(namespaceFunctions[0][1].loc.end, {
      line: owner.loc.end.line,
      column: Infinity,
    })
  )
    fail()
  const [statementId] = namespaceStatements[0]
  const [functionId, namespaceFunction] = namespaceFunctions[0]
  const [branchId] = namespaceBranches[0]
  if (namespaceFunction.name !== '(anonymous_0)') fail()
  const statement: StandardCoverageLocation = structuredClone(owner.loc)
  nextObserved.statementMap[statementId] = statement
  const declaration = {
    start: { ...owner.loc.start },
    end: { ...owner.id!.loc.start },
  }
  nextObserved.fnMap[functionId].decl = declaration
  nextObserved.fnMap[functionId].loc.start = { ...owner.loc.start }
  const branch = nextObserved.branchMap[branchId]
  branch.loc = {
    start: { ...owner.loc.end },
    end: { line: owner.loc.end.line, column: Infinity },
  }
  branch.line = owner.loc.end.line
  branch.locations = [structuredClone(branch.loc), structuredClone(branch.loc)]
  const statements = body(generatedBody)
  const used = new Set<Node>()
  for (const exported of body(block)) {
    const declarationNode = exported.declaration
    if (exported.type !== 'ExportNamedDeclaration' || !declarationNode) fail()
    if (declarationNode.type === 'VariableDeclaration') {
      if (
        declarationNode.kind !== 'const' ||
        declarationNode.declarations?.length !== 1
      )
        fail()
      const variable = declarationNode.declarations![0]
      if (
        variable.id?.type !== 'Identifier' ||
        !variable.id.name ||
        variable.init?.type !== 'Literal'
      )
        fail()
      const assignment = statements.filter((node) => {
        const expression = node.expression
        return (
          node.type === 'ExpressionStatement' &&
          expression?.type === 'AssignmentExpression' &&
          expression.operator === '=' &&
          expression.left?.type === 'MemberExpression' &&
          !expression.left.computed &&
          expression.left.object?.type === 'Identifier' &&
          expression.left.object.name === owner.id!.name &&
          expression.left.property?.type === 'Identifier' &&
          expression.left.property.name === variable.id!.name &&
          expression.right?.type === 'Literal' &&
          Object.is(expression.right.value, variable.init!.value) &&
          exact(expression.left.property.loc.start, variable.id!.loc.start) &&
          exact(expression.right.loc.start, variable.init!.loc.start)
        )
      })
      const model = Object.values(nextOriginal.statementMap).filter(
        (location) => same(location.start, variable.init!.loc.start)
      )
      const actual = Object.values(observed.statementMap).filter((location) =>
        same(location.start, variable.id!.loc.start)
      )
      if (assignment.length !== 1 || model.length !== 1 || actual.length !== 1)
        fail()
      model[0].start = { ...variable.id!.loc.start }
      used.add(assignment[0])
    } else if (declarationNode.type === 'FunctionDeclaration') {
      const id = declarationNode.id
      if (id?.type !== 'Identifier' || !id.name) fail()
      const actual = statements.filter(
        (node) =>
          node.type === 'FunctionDeclaration' &&
          node.id?.type === 'Identifier' &&
          node.id.name === id.name &&
          exact(node.id.loc.start, id.loc.start)
      )
      const publication = statements.filter((node) => {
        const expression = node.expression
        return (
          node.type === 'ExpressionStatement' &&
          expression?.type === 'AssignmentExpression' &&
          expression.operator === '=' &&
          expression.left?.type === 'MemberExpression' &&
          !expression.left.computed &&
          expression.left.object?.type === 'Identifier' &&
          expression.left.object.name === owner.id!.name &&
          expression.left.property?.type === 'Identifier' &&
          expression.left.property.name === id.name &&
          expression.right?.type === 'Identifier' &&
          expression.right.name === id.name &&
          exact(expression.left.property.loc.start, id.loc.start) &&
          exact(expression.right.loc.start, id.loc.start)
        )
      })
      const counters = Object.entries(observed.statementMap).filter(
        ([, location]) => same(location.start, id.loc.start)
      )
      if (
        actual.length !== 1 ||
        publication.length !== 1 ||
        counters.length !== 1 ||
        observed.s[counters[0][0]] !== observed.s[statementId]
      )
        fail()
      // This is only the compiler's publication of the already declared function.
      delete nextObserved.statementMap[counters[0][0]]
      delete nextObserved.s[counters[0][0]]
      used.add(actual[0])
      used.add(publication[0])
    } else fail()
  }
  if (statements.some((node) => !used.has(node))) fail()
  const locations = [statement, ...Object.values(nextOriginal.statementMap)]
  locations.sort(
    (a, b) => a.start.line - b.start.line || a.start.column - b.start.column
  )
  nextOriginal.statementMap = Object.fromEntries(
    locations.map((location, index) => [String(index), location])
  )
  nextOriginal.s = Object.fromEntries(locations.map((_, index) => [index, 0]))
  const originalFunctions = [
    structuredClone(nextObserved.fnMap[functionId]),
    ...Object.values(nextOriginal.fnMap),
  ]
  nextOriginal.fnMap = Object.fromEntries(
    originalFunctions.map((value, index) => [index, value])
  )
  nextOriginal.f = Object.fromEntries(
    originalFunctions.map((_, index) => [index, 0])
  )
  const branches = [
    ...Object.values(nextOriginal.branchMap),
    structuredClone(branch),
  ]
  nextOriginal.branchMap = Object.fromEntries(
    branches.map((value, index) => [index, value])
  )
  nextOriginal.b = Object.fromEntries(
    branches.map((value, index) => [index, value.locations.map(() => 0)])
  )
  nextOriginal.meta!.lastStatement = locations.length
  nextOriginal.meta!.lastFunction = originalFunctions.length
  nextOriginal.meta!.lastBranch = branches.length
  return { original: nextOriginal, observed: nextObserved }
}
