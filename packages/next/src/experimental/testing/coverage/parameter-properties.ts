import { decodeCoverageMap } from './maps'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc: { start: Point; end: Point }
  start?: number
  end?: number
  name?: string
  kind?: string
  computed?: boolean
  operator?: string
  id?: Node
  key?: Node
  value?: unknown
  raw?: string
  body?: unknown
  params?: Node[]
  parameter?: Node
  expression?: Node
  callee?: Node
  arguments?: Node[]
  optional?: boolean
  left?: Node
  right?: Node
  object?: Node
  property?: Node
}
const same = (a: Partial<Point> | undefined, b: Partial<Point> | undefined) =>
  !!a && !!b && a.line === b.line && a.column === b.column
function nodes(tree: unknown): Node[] {
  const result: Node[] = []
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (typeof (value as Node).type === 'string') result.push(value as Node)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(tree)
  return result
}
function body(node: Node | undefined): Node[] {
  return Array.isArray(node?.body) ? node.body : []
}

/** Bind real generated constructor assignments; this never supplies hit counts. */
export function bindParameterPropertyModel(
  file: string,
  source: string,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown,
  original: StandardCoverageData,
  observed: StandardCoverageData
) {
  const authoredNodes = nodes(authored)
  const properties = authoredNodes.filter(
    (node) => node.type === 'TSParameterProperty'
  )
  if (!properties.length) return { original, observed }
  function fail(): never {
    throw new Error(
      `Standard coverage cannot associate generated TSParameterProperty bodies: ${file}:${properties[0].loc.start.line}:${properties[0].loc.start.column}`
    )
  }
  const mappings = decodeCoverageMap(sourceMap).mappings
  const exact = (generated: Point, originals: Point[]) => {
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
          originals.some(
            (point) =>
              mapping.originalLine === point.line &&
              mapping.originalColumn === point.column
          )
      ) &&
      originals.every((point) =>
        found.some(
          (mapping) =>
            mapping.originalLine === point.line &&
            mapping.originalColumn === point.column
        )
      )
    )
  }
  const uniqueMapping = (generated: Point, originalPoint: Point) =>
    mappings.filter(
      (mapping) =>
        mapping.generatedLine === generated.line &&
        mapping.generatedColumn === generated.column
    ).length === 1 && exact(generated, [originalPoint])
  const emittedNodes = nodes(emitted)
  function matchesCallArguments(initializer: Node, generated: Node) {
    if (initializer.arguments?.length === 0)
      return generated.arguments?.length === 0
    if (
      initializer.arguments?.length !== 1 ||
      generated.arguments?.length !== 1
    )
      return false
    const argument = initializer.arguments[0]
    const actual = generated.arguments[0]
    if (
      argument.type !== 'Literal' ||
      actual.type !== 'Literal' ||
      typeof argument.value !== 'number' ||
      !Number.isFinite(argument.value) ||
      actual.value !== argument.value ||
      typeof argument.raw !== 'string' ||
      actual.raw !== argument.raw ||
      argument.start === undefined ||
      argument.end === undefined ||
      source.slice(argument.start, argument.end) !== argument.raw ||
      actual.start === undefined ||
      actual.end === undefined ||
      actual.end - actual.start !== actual.raw.length ||
      actual.loc.start.line !== actual.loc.end.line ||
      actual.loc.end.column - actual.loc.start.column !== actual.raw.length ||
      !uniqueMapping(actual.loc.start, argument.loc.start)
    )
      return false
    const authoredArguments = authoredNodes.filter(
      (node) =>
        node.type === 'Literal' &&
        same(node.loc.start, argument.loc.start) &&
        same(node.loc.end, argument.loc.end)
    )
    const generatedArguments = emittedNodes.filter(
      (node) =>
        node.type === 'Literal' && exact(node.loc.start, [argument.loc.start])
    )
    return (
      authoredArguments.length === 1 &&
      authoredArguments[0] === argument &&
      generatedArguments.length === 1 &&
      generatedArguments[0] === actual
    )
  }
  function matchesInitializer(initializer: Node, generated: Node | undefined) {
    if (initializer.type === 'Literal')
      return (
        generated?.type === 'Literal' &&
        generated.value === initializer.value &&
        exact(generated.loc.start, [initializer.loc.start]) &&
        exact(generated.loc.end, [initializer.loc.end])
      )
    if (
      initializer.type !== 'CallExpression' ||
      generated?.type !== 'CallExpression' ||
      initializer.optional ||
      generated.optional ||
      initializer.callee?.type !== 'Identifier' ||
      generated.callee?.type !== 'Identifier' ||
      !initializer.callee.name ||
      initializer.callee.name !== generated.callee.name ||
      !matchesCallArguments(initializer, generated) ||
      !same(initializer.loc.start, initializer.callee.loc.start) ||
      !same(generated.loc.start, generated.callee.loc.start) ||
      !uniqueMapping(generated.loc.start, initializer.loc.start) ||
      !uniqueMapping(generated.loc.end, initializer.loc.end)
    )
      return false
    const authoredCalls = authoredNodes.filter(
      (node) =>
        node.type === 'CallExpression' &&
        same(node.loc.start, initializer.loc.start) &&
        same(node.loc.end, initializer.loc.end)
    )
    const generatedCalls = emittedNodes.filter(
      (node) =>
        node.type === 'CallExpression' &&
        exact(node.loc.start, [initializer.loc.start]) &&
        exact(node.loc.end, [initializer.loc.end])
    )
    return (
      authoredCalls.length === 1 &&
      authoredCalls[0] === initializer &&
      generatedCalls.length === 1 &&
      generatedCalls[0] === generated
    )
  }
  const emittedClasses = emittedNodes.filter(
    (node) => node.type === 'ClassDeclaration'
  )
  const used = new Set<Node>()
  const statementIds = new Set<string>()
  const additions: StandardCoverageLocation[] = []
  const nextOriginal = structuredClone(original)
  const nextObserved = structuredClone(observed)
  for (const owner of authoredNodes.filter(
    (node) => node.type === 'ClassDeclaration'
  )) {
    const methods = body(owner.body as Node)
    for (const method of methods) {
      if (method.type !== 'MethodDefinition' || method.kind !== 'constructor')
        continue
      const fn = method.value as Node
      const params = fn?.params
      if (!params?.some((param) => param.type === 'TSParameterProperty'))
        continue
      const matching = emittedClasses.filter(
        (node) =>
          !!node.id?.loc &&
          !!owner.id?.loc &&
          exact(node.id.loc.start, [owner.id.loc.start])
      )
      if (matching.length !== 1) fail()
      const constructors = body(matching[0].body as Node).filter(
        (node) =>
          node.type === 'MethodDefinition' && node.kind === 'constructor'
      )
      if (constructors.length !== 1 || method.computed) fail()
      const generated = constructors[0].value as Node
      const generatedBody = generated?.body as Node
      const authoredBody = fn.body as Node
      if (
        generated?.params?.length !== params.length ||
        generatedBody?.type !== 'BlockStatement' ||
        authoredBody?.type !== 'BlockStatement' ||
        !exact(constructors[0].key!.loc.start, [method.key!.loc.start]) ||
        !exact(generatedBody.loc.start, [authoredBody.loc.start])
      )
        fail()
      for (const [index, param] of params.entries()) {
        if (param.type !== 'TSParameterProperty') continue
        const argument = param.parameter
        const identifier =
          argument?.type === 'AssignmentPattern' ? argument.left : argument
        const initializer =
          argument?.type === 'AssignmentPattern' ? argument.right : undefined
        const actualParam = generated.params![index]
        const actualIdentifier =
          actualParam.type === 'AssignmentPattern'
            ? actualParam.left
            : actualParam
        const boundary = params[index + 1] ?? authoredBody
        const generatedBoundary = generated.params![index + 1] ?? generatedBody
        const boundaryIdentifier =
          boundary.type === 'TSParameterProperty'
            ? boundary.parameter?.type === 'AssignmentPattern'
              ? boundary.parameter.left
              : boundary.parameter
            : undefined
        if (
          identifier?.type !== 'Identifier' ||
          !identifier.name ||
          actualIdentifier?.type !== 'Identifier' ||
          actualIdentifier.name !== identifier.name ||
          !exact(actualIdentifier.loc.start, [
            param.loc.start,
            identifier.loc.start,
          ]) ||
          !exact(generatedBoundary.loc.start, [
            boundary.loc.start,
            ...(boundaryIdentifier ? [boundaryIdentifier.loc.start] : []),
          ]) ||
          param.end === undefined ||
          boundary.start === undefined ||
          !/^[\s,)]*$/.test(source.slice(param.end, boundary.start)) ||
          (initializer &&
            (actualParam.type !== 'AssignmentPattern' ||
              !matchesInitializer(initializer, actualParam.right)))
        )
          fail()
        const assignments = body(generatedBody).filter((statement) => {
          const expression = statement.expression
          return (
            statement.type === 'ExpressionStatement' &&
            expression?.type === 'AssignmentExpression' &&
            expression.operator === '=' &&
            expression.left?.type === 'MemberExpression' &&
            expression.left.computed === false &&
            expression.left.object?.type === 'ThisExpression' &&
            expression.left.property?.type === 'Identifier' &&
            expression.left.property.name === identifier.name &&
            expression.right?.type === 'Identifier' &&
            expression.right.name === identifier.name &&
            exact(expression.left.property.loc.start, [identifier.loc.start]) &&
            exact(expression.right.loc.start, [identifier.loc.start])
          )
        })
        const statements = Object.entries(observed.statementMap).filter(
          ([, location]) => same(location.start, identifier.loc.start)
        )
        if (
          assignments.length !== 1 ||
          statements.length !== 1 ||
          statementIds.has(statements[0][0]) ||
          Object.values(original.statementMap).some((location) =>
            same(location.start, identifier.loc.start)
          ) ||
          !same(
            statements[0][1].end,
            initializer?.loc.start ?? identifier.loc.end
          )
        )
          fail()
        const end = (start: Point): Point =>
          boundary.loc.start.line === start.line
            ? { ...boundary.loc.start }
            : { line: start.line, column: Infinity }
        const [statementId] = statements[0]
        const location = nextObserved.statementMap[statementId]
        if (!initializer) location.end = end(identifier.loc.start)
        additions.push(structuredClone(location))
        statementIds.add(statementId)
        used.add(param)
        if (initializer) {
          const select = (data: StandardCoverageData) =>
            Object.entries(data.branchMap).filter(
              ([, branch]) =>
                branch.type === 'default-arg' &&
                branch.locations.length === 1 &&
                same(branch.locations[0].start, initializer.loc.start)
            )
          const modelBranches = select(nextOriginal)
          const actualBranches = select(nextObserved)
          if (
            modelBranches.length !== 1 ||
            actualBranches.length !== 1 ||
            !same(modelBranches[0][1].loc.start, argument!.loc.start) ||
            !same(actualBranches[0][1].loc.start, param.loc.start) ||
            !same(actualBranches[0][1].loc.end, initializer.loc.end)
          )
            fail()
          for (const [, branch] of [modelBranches[0], actualBranches[0]]) {
            branch.loc.start = { ...param.loc.start }
            branch.loc.end = end(initializer.loc.start)
            branch.locations[0].end = end(initializer.loc.start)
          }
        }
      }
    }
  }
  if (
    properties.some((property) => !used.has(property)) ||
    Object.keys(original.statementMap).length + additions.length !==
      Object.keys(observed.statementMap).length ||
    !original.meta
  )
    fail()
  const statements = [...Object.values(nextOriginal.statementMap), ...additions]
  statements.sort(
    (a, b) => a.start.line - b.start.line || a.start.column - b.start.column
  )
  nextOriginal.statementMap = Object.fromEntries(
    statements.map((location, index) => [String(index), location])
  )
  nextOriginal.s = Object.fromEntries(
    statements.map((_, index) => [String(index), 0])
  )
  nextOriginal.meta!.lastStatement = statements.length
  return { original: nextOriginal, observed: nextObserved }
}
