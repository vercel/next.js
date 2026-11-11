import { decodeCoverageMap } from './maps'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = { line: number; column: number }
type Node = {
  type: string
  start: number
  end: number
  loc: { start: Point; end: Point }
  name?: string
  value?: unknown
  operator?: string
  computed?: boolean
  optional?: boolean
  declare?: boolean
  const?: boolean
  async?: boolean
  generator?: boolean
  id?: Node
  initializer?: Node
  init?: Node
  argument?: Node
  callee?: Node
  expression?: Node
  object?: Node
  property?: Node
  left?: Node
  right?: Node
  test?: Node
  consequent?: Node
  alternate?: Node | null
  declaration?: Node
  body?: Node | Node[]
  members?: Node[]
  params?: Node[]
  arguments?: Node[]
  properties?: Node[]
}
const same = (a: Partial<Point>, b: Partial<Point>) =>
  a.line === b.line && a.column === b.column
const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
function nodes(value: unknown): Node[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(nodes)
  return [
    ...((value as Node).type ? [value as Node] : []),
    ...Object.entries(value)
      .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
      .flatMap(([, child]) => nodes(child)),
  ]
}

export function hasEnumDeclaration(ast: unknown) {
  return nodes(ast).some((node) => node.type === 'TSEnumDeclaration')
}

/** Associate literal enum writes with their individual, actual generated counters. */
export function bindEnumModel(
  file: string,
  source: string,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown,
  original: StandardCoverageData,
  observed: StandardCoverageData,
  generated: StandardCoverageData
) {
  const authoredNodes = nodes(authored)
  const owners = authoredNodes.filter(
    (node) => node.type === 'TSEnumDeclaration'
  )
  if (!owners.length) return { original, observed }
  const owner = owners[0]
  const program = authored as Node
  const topLevel =
    Array.isArray(program.body) &&
    program.body.some(
      (node) =>
        node === owner ||
        (node.type === 'ExportNamedDeclaration' && node.declaration === owner)
    )
  function fail(): never {
    throw new Error(
      `Standard coverage cannot associate generated TSEnumDeclaration bodies: ${file}:${owner.loc.start.line}:${owner.loc.start.column}`
    )
  }
  if (
    owners.length !== 1 ||
    !topLevel ||
    owner.declare ||
    owner.const ||
    owner.id?.type !== 'Identifier' ||
    !owner.id.name ||
    !owner.members?.length ||
    source.slice(owner.start, owner.id.start).trim() !== 'enum' ||
    source[owner.end - 1] !== '}' ||
    authoredNodes.some((node) =>
      ['TSModuleDeclaration', 'TSParameterProperty'].includes(node.type)
    ) ||
    !original.meta ||
    !observed.meta
  )
    fail()
  const mappings = decodeCoverageMap(sourceMap).mappings
  function mapped(point: Point, allowed: Point[]) {
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
          allowed.some(
            (target) =>
              mapping.originalLine === target.line &&
              mapping.originalColumn === target.column
          )
      ) &&
      allowed.every((target) =>
        found.some(
          (mapping) =>
            mapping.originalLine === target.line &&
            mapping.originalColumn === target.column
        )
      )
    )
  }
  const variables = nodes(emitted).filter(
    (node) =>
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      mapped(node.id.loc.start, [owner.loc.start, owner.id!.loc.start])
  )
  if (variables.length !== 1) fail()
  const variable = variables[0]
  const call = variable.init
  const fn = call?.callee
  const block = fn?.body as Node | undefined
  const parameter = fn?.params?.[0]
  if (
    call?.type !== 'CallExpression' ||
    call.optional ||
    call.arguments?.length !== 1 ||
    call.arguments[0].type !== 'ObjectExpression' ||
    call.arguments[0].properties?.length !== 0 ||
    fn?.type !== 'FunctionExpression' ||
    fn.id ||
    fn.async ||
    fn.generator ||
    fn.params?.length !== 1 ||
    parameter?.type !== 'Identifier' ||
    !parameter.name ||
    !mapped(parameter.loc.start, [owner.id!.loc.start]) ||
    block?.type !== 'BlockStatement' ||
    !Array.isArray(block.body) ||
    block.body.length !== owner.members!.length + 1
  )
    fail()
  const statements = block!.body as Node[]
  const isParameter = (node: Node | undefined) =>
    node?.type === 'Identifier' && node.name === parameter!.name
  const assignment = (node: Node | undefined) =>
    node?.type === 'AssignmentExpression' && node.operator === '='
  const member = (node: Node | undefined, name: string) =>
    node?.type === 'MemberExpression' &&
    !node.optional &&
    node.computed &&
    isParameter(node.object) &&
    node.property?.type === 'Literal' &&
    node.property.value === name
  const literal = (node: Node | undefined): unknown => {
    if (node?.type === 'Literal') return node.value
    if (
      node?.type === 'UnaryExpression' &&
      node.operator === '-' &&
      node.argument?.type === 'Literal' &&
      typeof node.argument.value === 'number'
    )
      return -node.argument.value
    return undefined
  }
  const used = new Set<string>()
  function count(node: Node) {
    const found = Object.entries(generated.statementMap).filter(
      ([, location]) => same(location.start, node.loc.start)
    )
    if (found.length !== 1 || used.has(found[0][0])) fail()
    const id = found[0][0]
    used.add(id)
    const value = generated.s[id]
    if (!Number.isSafeInteger(value) || value < 0) fail()
    return value
  }
  const headerCount = count(call!)
  const functionCounters = Object.entries(generated.fnMap).filter(
    ([, value]) =>
      same(value.decl.start, fn!.loc.start) &&
      same(value.loc.start, block!.loc.start) &&
      same(value.loc.end, block!.loc.end)
  )
  if (
    functionCounters.length !== 1 ||
    generated.f[functionCounters[0][0]] !== headerCount
  )
    fail()
  const names = new Set<string>()
  const values = new Map<string, { value: string | number; member: Node }>()
  const hits: number[] = []
  let previous: unknown = -1
  let previousCount = headerCount
  for (const [index, authoredMember] of owner.members!.entries()) {
    const nameNode = authoredMember.id
    const name =
      nameNode?.type === 'Identifier'
        ? nameNode.name
        : nameNode?.type === 'Literal' && typeof nameNode.value === 'string'
          ? nameNode.value
          : undefined
    const value = authoredMember.initializer
      ? literal(authoredMember.initializer)
      : typeof previous === 'number'
        ? previous + 1
        : undefined
    if (
      name === undefined ||
      names.has(name) ||
      !(
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
    )
      fail()
    names.add(name)
    values.set(name, {
      value: value as string | number,
      member: authoredMember,
    })
    previous = value
    const statement = statements[index]
    const expression = statement.expression
    if (statement.type !== 'ExpressionStatement' || !assignment(expression))
      fail()
    if (typeof value === 'number') {
      const outer = expression!.left
      const inner = outer?.property
      if (
        outer?.type !== 'MemberExpression' ||
        outer.optional ||
        !outer.computed ||
        !isParameter(outer.object) ||
        !assignment(inner) ||
        !member(inner!.left, name!) ||
        !Object.is(literal(inner!.right), value) ||
        expression!.right?.type !== 'Literal' ||
        expression!.right.value !== name
      )
        fail()
    } else if (
      !member(expression!.left, name!) ||
      expression!.right?.type !== 'Literal' ||
      expression!.right.value !== value
    )
      fail()
    const hit = count(statement)
    if (hit > previousCount) fail()
    previousCount = hit
    hits.push(hit)
  }
  const returned = statements.at(-1)!
  if (
    returned.type !== 'ReturnStatement' ||
    !isParameter(returned.argument) ||
    count(returned) > previousCount
  )
    fail()
  const inside = (point: Partial<Point>) =>
    typeof point.line === 'number' &&
    typeof point.column === 'number' &&
    compare(point as Point, owner.loc.start) >= 0 &&
    compare(point as Point, owner.loc.end) < 0
  const functions = Object.entries(observed.fnMap).filter(([, value]) =>
    inside(value.decl.start)
  )
  if (
    functions.length !== 1 ||
    observed.f[functions[0][0]] !== headerCount ||
    Object.values(observed.branchMap).some((value) => inside(value.loc.start))
  )
    fail()
  const nextOriginal = structuredClone(original)
  const nextObserved = structuredClone(observed)
  // Constant enum reads may point back to the declaration after inlining. Only
  // repair a backwards endpoint when both actual ASTs and counters prove the
  // complete unchanged statement, including each inlined member value.
  const emittedNodes = nodes(emitted)
  const repairs = new Map<Node, Node>()
  function equivalent(authoredNode: Node, actualNode: Node) {
    let enumReads = 0
    function expression(a: Node | undefined, b: Node | undefined): boolean {
      if (!a || !b) return false
      if (
        a.type === 'MemberExpression' &&
        a.object?.type === 'Identifier' &&
        a.object.name === owner.id!.name
      ) {
        const name = a.computed ? a.property?.value : a.property?.name
        const entry = typeof name === 'string' ? values.get(name) : undefined
        if (!entry || a.optional || !Object.is(literal(b), entry.value))
          return false
        const allowed = [
          owner.id!.loc.start,
          a.loc.start,
          entry.member.initializer?.loc.start,
        ].filter((point): point is Point => !!point)
        const found = mappings.filter(
          (mapping) =>
            mapping.generatedLine === b.loc.start.line &&
            mapping.generatedColumn === b.loc.start.column
        )
        if (
          !found.every(
            (mapping) =>
              mapping.source === file &&
              allowed.some(
                (point) =>
                  mapping.originalLine === point.line &&
                  mapping.originalColumn === point.column
              )
          )
        )
          return false
        enumReads++
        return true
      }
      if (a.type !== b.type) return false
      if (a.type === 'Identifier') return a.name === b.name
      if (a.type === 'Literal') return Object.is(a.value, b.value)
      if (a.type === 'BinaryExpression')
        return (
          a.operator === b.operator &&
          expression(a.left, b.left) &&
          expression(a.right, b.right)
        )
      return false
    }
    function statement(a: Node, b: Node): boolean {
      if (a.type !== b.type || !mapped(b.loc.start, [a.loc.start])) return false
      if (a.type === 'ReturnStatement')
        return expression(a.argument, b.argument)
      return (
        a.type === 'IfStatement' &&
        !a.alternate &&
        !b.alternate &&
        !!a.consequent &&
        !!b.consequent &&
        expression(a.test, b.test) &&
        statement(a.consequent, b.consequent)
      )
    }
    return statement(authoredNode, actualNode) && enumReads > 0
  }
  for (const [id, location] of Object.entries(nextObserved.statementMap)) {
    if (location.end.line >= location.start.line) continue
    const authoredStatements = authoredNodes.filter(
      (node) =>
        ['IfStatement', 'ReturnStatement'].includes(node.type) &&
        same(node.loc.start, location.start)
    )
    const modelLocations = Object.values(original.statementMap).filter(
      (value) => same(value.start, location.start)
    )
    if (
      authoredStatements.length !== 1 ||
      modelLocations.length !== 1 ||
      location.end.line < owner.loc.start.line ||
      location.end.line > owner.loc.end.line ||
      location.end.column !== Infinity
    )
      fail()
    const statement = authoredStatements[0]
    const candidates = emittedNodes.filter(
      (node) =>
        node.type === statement.type &&
        mapped(node.loc.start, [statement.loc.start]) &&
        equivalent(statement, node)
    )
    if (candidates.length !== 1 || count(candidates[0]) !== observed.s[id])
      fail()
    nextObserved.statementMap[id].end = { ...modelLocations[0].end }
    repairs.set(statement, candidates[0])
  }
  for (const [id, branch] of Object.entries(nextObserved.branchMap)) {
    if (branch.loc.end.line >= branch.loc.start.line) continue
    const statement = [...repairs.keys()].find(
      (node) =>
        node.type === 'IfStatement' && same(node.loc.start, branch.loc.start)
    )
    const actual = statement && repairs.get(statement)
    const model = Object.values(original.branchMap).filter((value) =>
      same(value.loc.start, branch.loc.start)
    )
    const actualBranches =
      actual &&
      Object.entries(generated.branchMap).filter(
        ([, value]) =>
          value.type === 'if' && same(value.loc.start, actual.loc.start)
      )
    if (
      branch.type !== 'if' ||
      !statement ||
      model.length !== 1 ||
      !actualBranches ||
      actualBranches.length !== 1 ||
      branch.locations.length !== 2 ||
      branch.locations[1].start.line !== undefined ||
      branch.locations[1].end.line !== undefined ||
      !same(branch.loc.end, branch.locations[0].end) ||
      generated.b[actualBranches[0][0]].length !== observed.b[id].length ||
      generated.b[actualBranches[0][0]].some(
        (hit, index) => hit !== observed.b[id][index]
      )
    )
      fail()
    branch.loc.end = { ...model[0].loc.end }
    branch.locations[0].end = { ...model[0].locations[0].end }
  }
  const header = {
    start: { ...owner.loc.start },
    end: { line: owner.loc.end.line, column: Infinity },
  }
  const locations: StandardCoverageLocation[] = [header]
  for (const [index, authoredMember] of owner.members!.entries()) {
    const next = owner.members![index + 1]?.loc.start ?? {
      line: owner.loc.end.line,
      column: owner.loc.end.column - 1,
    }
    locations.push({
      start: { ...authoredMember.loc.start },
      end:
        next.line === authoredMember.loc.start.line
          ? { ...next }
          : { line: authoredMember.loc.end.line, column: Infinity },
    })
  }
  for (const model of [nextOriginal, nextObserved]) {
    for (const [id, location] of Object.entries(model.statementMap))
      if (inside(location.start)) {
        delete model.statementMap[id]
        delete model.s[id]
      }
    let id = Math.max(-1, ...Object.keys(model.statementMap).map(Number)) + 1
    for (const [index, location] of locations.entries()) {
      model.statementMap[String(id)] = structuredClone(location)
      model.s[String(id++)] =
        model === nextOriginal ? 0 : index === 0 ? headerCount : hits[index - 1]
    }
  }
  const [functionId, observedFunction] = functions[0]
  const declaration = {
    start: { ...owner.loc.start },
    end: { ...owner.id!.loc.start },
  }
  const enumFunction = {
    ...structuredClone(observedFunction),
    decl: declaration,
    loc: structuredClone(header),
    line: owner.loc.start.line,
  }
  nextObserved.fnMap[functionId] = enumFunction
  for (const [id, value] of Object.entries(nextOriginal.fnMap))
    if (inside(value.decl.start)) {
      delete nextOriginal.fnMap[id]
      delete nextOriginal.f[id]
    }
  const originalFunctionId = String(
    Math.max(-1, ...Object.keys(nextOriginal.fnMap).map(Number)) + 1
  )
  nextOriginal.fnMap[originalFunctionId] = structuredClone(enumFunction)
  nextOriginal.f[originalFunctionId] = 0
  // The report's original order determines stable public IDs; hits stay observed.
  const orderedStatements = Object.values(nextOriginal.statementMap).sort(
    (a, b) => compare(a.start as Point, b.start as Point)
  )
  nextOriginal.statementMap = Object.fromEntries(
    orderedStatements.map((value, index) => [String(index), value])
  )
  nextOriginal.s = Object.fromEntries(
    orderedStatements.map((_, index) => [String(index), 0])
  )
  const orderedFunctions = Object.values(nextOriginal.fnMap).sort((a, b) =>
    compare(a.decl.start as Point, b.decl.start as Point)
  )
  nextOriginal.fnMap = Object.fromEntries(
    orderedFunctions.map((value, index) => [String(index), value])
  )
  nextOriginal.f = Object.fromEntries(
    orderedFunctions.map((_, index) => [String(index), 0])
  )
  nextOriginal.meta!.lastStatement = orderedStatements.length
  nextOriginal.meta!.lastFunction = orderedFunctions.length
  return { original: nextOriginal, observed: nextObserved }
}
