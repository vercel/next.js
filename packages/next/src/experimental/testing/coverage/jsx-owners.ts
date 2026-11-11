import { SourceMapGenerator } from 'next/dist/compiled/source-map'
import { decodeCoverageMap } from './maps'
import { browserJsxChildKey } from './browser-jsx-associations'
import type { ArrowBindingAssociation } from './arrow-bindings'
import type { BrowserClassicFactory } from './browser-imports'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc: StandardCoverageLocation
  start?: number
  end?: number
  extra?: { parenthesized?: boolean; parenStart?: number }
  name?: string
  value?: unknown
  operator?: string
  left?: Node
  right?: Node
  body?: Node
  expression?: Node
  openingElement?: { name?: Node; attributes?: Node[] }
  closingElement?: { type: string; loc: StandardCoverageLocation; name?: Node }
  openingFragment?: Node
  closingFragment?: Node
  children?: Node[]
  arguments?: Node[]
  argument?: Node
  properties?: Node[]
  elements?: (Node | null)[]
  property?: Node
  computed?: boolean
  callee?: Node
  object?: Node
  optional?: boolean
  test?: Node
  consequent?: Node
  alternate?: Node
  expressions?: Node[]
  key?: Node
  params?: Node[]
  id?: Node
}
const same = (a: Partial<Point> | undefined, b: Partial<Point> | undefined) =>
  !!a && !!b && a.line === b.line && a.column === b.column
const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
function jsxCallName(node: Node): unknown {
  const callee = node.callee
  const target = callee?.expressions?.[1]
  if (
    callee?.type === 'SequenceExpression' &&
    callee.expressions?.length === 2 &&
    callee.expressions[0].type === 'Literal' &&
    callee.expressions[0].value === 0 &&
    target?.type === 'MemberExpression' &&
    target.computed === true &&
    target.property?.type === 'Literal'
  )
    return target.property.value
}
function nodes(ast: unknown): Node[] {
  const result: Node[] = []
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (typeof (value as Node).type === 'string') result.push(value as Node)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(ast)
  return result
}
function facts(file: string, sourceMap: unknown) {
  const mappings = decodeCoverageMap(sourceMap).mappings.map((mapping) => ({
    generated: {
      line: mapping.generatedLine,
      column: mapping.generatedColumn,
    },
    source: mapping.source,
    original: {
      line: mapping.originalLine!,
      column: mapping.originalColumn!,
    },
  }))
  const exact = (generated: Point, original: Point) => {
    const found = mappings.filter((mapping) =>
      same(mapping.generated, generated)
    )
    return (
      found.length > 0 &&
      found.every(
        (mapping) => mapping.source === file && same(mapping.original, original)
      )
    )
  }
  const element = (authored: Node, emitted: Node) => {
    const tag = authored.openingElement?.name
    const argument = emitted.arguments?.[0]
    if (authored.type === 'JSXFragment')
      return (
        emitted.type === 'CallExpression' &&
        argument?.type === 'MemberExpression' &&
        argument.computed === true &&
        argument.property?.type === 'Literal' &&
        argument.property.value === 'Fragment' &&
        exact(emitted.loc.start, authored.loc.start)
      )
    return (
      authored.type === 'JSXElement' &&
      tag?.type === 'JSXIdentifier' &&
      emitted.type === 'CallExpression' &&
      argument?.type === 'Literal' &&
      argument.value === tag.name &&
      exact(emitted.loc.start, authored.loc.start) &&
      exact(argument.loc.start, tag.loc.start)
    )
  }
  const terminal = (authored: Node, emitted: Node) => {
    const closing =
      authored.type === 'JSXFragment'
        ? authored.closingFragment
        : authored.closingElement
    if (!closing || !same(closing.loc.end, authored.loc.end)) return false
    const mapped = mappings.filter(
      (mapping) =>
        mapping.source !== null &&
        compare(mapping.generated, emitted.loc.start) >= 0 &&
        compare(mapping.generated, emitted.loc.end) < 0
    )
    return (
      mapped.length > 0 &&
      mapped.every(
        (mapping) =>
          mapping.source === file &&
          compare(mapping.original, authored.loc.start) >= 0 &&
          compare(mapping.original, authored.loc.end) < 0
      ) &&
      same(mapped[mapped.length - 1].original, {
        line: authored.loc.end.line,
        column: authored.loc.end.column - 1,
      })
    )
  }
  return { mappings, exact, element, terminal }
}

/** Parentheses can outlive the emitted JSX initializer, but never its counters. */
export function bindJsxArrowInitializerEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  associations: ArrowBindingAssociation[],
  sourceMap: unknown
): void {
  const { element, terminal } = facts(file, sourceMap)
  const repairs: { location: StandardCoverageLocation; end: Point }[] = []
  const used = new Set<StandardCoverageLocation>()
  for (const association of associations) {
    const body = association.original.body as Node | undefined
    if (
      association.callback ||
      association.property ||
      (body?.type !== 'JSXElement' && body?.type !== 'JSXFragment') ||
      association.original.loc.end.line <= body.loc.end.line
    )
      continue
    const generated = association.generated.body as Node | undefined
    const modelStatements = Object.values(model.statementMap).filter(
      (location) => same(location.start, association.start)
    )
    const initializers = Object.values(observed.statementMap).filter(
      (location) => same(location.start, association.start)
    )
    const bodies = Object.values(observed.statementMap).filter((location) =>
      same(location.start, body.loc.start)
    )
    if (
      !generated ||
      !element(body, generated) ||
      !terminal(body, generated) ||
      modelStatements.length !== 1 ||
      initializers.length !== 1 ||
      bodies.length !== 1 ||
      used.has(modelStatements[0]) ||
      modelStatements[0].end.line !== association.original.loc.end.line ||
      !same(initializers[0].end, bodies[0].end) ||
      bodies[0].end.line !== body.loc.end.line ||
      bodies[0].end.column !== Infinity
    )
      throw new Error(
        `Standard coverage JSX initializer association is ambiguous or absent: ${file}:${association.start.line}:${association.start.column}`
      )
    used.add(modelStatements[0])
    repairs.push({ location: modelStatements[0], end: initializers[0].end })
  }
  for (const { location, end } of repairs) location.end = { ...end }
}

/** A parenthesized JSX return ends at its actual emitted closing terminal. */
export function bindJsxReturnEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown
): void {
  const { exact, element, terminal } = facts(file, sourceMap)
  const generatedNodes = nodes(emitted)
  const repairs: { location: StandardCoverageLocation; end: Point }[] = []
  const used = new Set<StandardCoverageLocation>()
  for (const node of nodes(authored)) {
    const body = node.argument
    if (
      node.type !== 'ReturnStatement' ||
      body?.type !== 'JSXElement' ||
      node.loc.end.line <= body.loc.end.line
    )
      continue
    const returns = generatedNodes.filter(
      (candidate) =>
        candidate.type === 'ReturnStatement' &&
        candidate.argument &&
        exact(candidate.loc.start, node.loc.start) &&
        element(body, candidate.argument)
    )
    const original = Object.values(model.statementMap).filter((location) =>
      same(location.start, node.loc.start)
    )
    const actual = Object.values(observed.statementMap).filter((location) =>
      same(location.start, node.loc.start)
    )
    const parenStart = body.extra?.parenStart
    if (
      body.extra?.parenthesized !== true ||
      typeof node.start !== 'number' ||
      typeof body.start !== 'number' ||
      typeof parenStart !== 'number' ||
      !Number.isSafeInteger(parenStart) ||
      parenStart <= node.start ||
      parenStart >= body.start ||
      returns.length !== 1 ||
      !terminal(body, returns[0].argument!) ||
      original.length !== 1 ||
      actual.length !== 1 ||
      used.has(original[0]) ||
      original[0].end.line !== node.loc.end.line ||
      original[0].end.column !== Infinity ||
      actual[0].end.line !== body.loc.end.line ||
      actual[0].end.column !== Infinity
    )
      throw new Error(
        `Standard coverage JSX return association is ambiguous or absent: ${file}:${node.loc.start.line}:${node.loc.start.column}`
      )
    used.add(original[0])
    repairs.push({ location: original[0], end: actual[0].end })
  }
  for (const { location, end } of repairs) location.end = { ...end }
}

/** An enclosing JSX close cannot supply a logical child's branch endpoint. */
export function bindJsxLogicalChildEnds(
  file: string,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown,
  mode?: 'development' | 'production',
  model?: StandardCoverageData,
  browserJsxChildren?: ReadonlySet<string>
): void {
  const { mappings, exact, element, terminal } = facts(file, sourceMap)
  const originalNodes = nodes(authored),
    generatedNodes = nodes(emitted)
  const repairs: { end: Partial<Point> }[] = []
  const fragmentRepairs: {
    location: { end: Partial<Point> }
    end: Point
  }[] = []
  const used = new Set<StandardCoverageData['branchMap'][string]>()
  for (const node of originalNodes) {
    if (browserJsxChildren?.has(browserJsxChildKey(node))) continue
    if (
      node.type !== 'LogicalExpression' ||
      node.operator !== '&&' ||
      node.left?.type !== 'Identifier' ||
      node.right?.type !== 'JSXElement'
    )
      continue
    const right = node.right
    const branches = Object.values(observed.branchMap).filter(
      (branch) =>
        branch.type === 'binary-expr' &&
        same(branch.loc.start, node.loc.start) &&
        branch.locations.length === 2 &&
        same(branch.locations[0].start, node.left!.loc.start) &&
        same(branch.locations[1].start, right.loc.start)
    )
    const fail = (): never => {
      throw new Error(
        `Standard coverage JSX logical child association is ambiguous or absent: ${file}:${node.loc.start.line}:${node.loc.start.column}`
      )
    }
    const containers = originalNodes.filter(
      (candidate) =>
        candidate.type === 'JSXExpressionContainer' &&
        candidate.expression === node
    )
    const owners = originalNodes.filter(
      (candidate) =>
        (candidate.type === 'JSXElement' || candidate.type === 'JSXFragment') &&
        containers.length === 1 &&
        candidate.children?.includes(containers[0])
    )
    if (
      model &&
      node.loc.start.line < node.loc.end.line &&
      owners.some(
        (owner) =>
          owner.type === 'JSXElement' ||
          (owner.type === 'JSXFragment' &&
            owner.loc.start.line < owner.loc.end.line &&
            owner.children?.length === 5)
      )
    ) {
      const owner = owners[0]
      const fragment = owner?.type === 'JSXFragment'
      const parenthesized = right.extra?.parenthesized === true
      const parenStart = right.extra?.parenStart
      const next = owner?.children?.[3]
      const tag = next?.openingElement?.name
      const models = Object.values(model.branchMap).filter(
        (branch) =>
          branch.type === 'binary-expr' &&
          same(branch.loc.start, node.loc.start) &&
          branch.locations.length === 2 &&
          same(branch.locations[0].start, node.left!.loc.start) &&
          same(branch.locations[1].start, right.loc.start)
      )
      const content = decodeCoverageMap(sourceMap).sources.get(file)
      const whitespace = (child: Node) =>
        child.type === 'JSXText' &&
        typeof child.value === 'string' &&
        /\n/.test(child.value) &&
        /^\s*$/.test(child.value)
      const end = { line: right.loc.end.line, column: Infinity }
      if (
        (mode !== 'development' && mode !== 'production') ||
        branches.length !== 1 ||
        models.length !== 1 ||
        used.has(branches[0]) ||
        owners.length !== 1 ||
        (owner.type !== 'JSXElement' && owner.type !== 'JSXFragment') ||
        owner.loc.start.line === owner.loc.end.line ||
        owner.children?.length !== 5 ||
        owner.children[1] !== containers[0] ||
        ![owner.children[0], owner.children[2], owner.children[4]].every(
          whitespace
        ) ||
        next?.type !== 'JSXElement' ||
        tag?.type !== 'JSXIdentifier' ||
        (parenthesized
          ? parenStart === undefined ||
            !Number.isInteger(parenStart) ||
            node.start === undefined ||
            right.start === undefined ||
            parenStart <= node.start ||
            parenStart >= right.start ||
            typeof content !== 'string' ||
            content[parenStart] !== '(' ||
            content.split('\n')[node.loc.end.line - 1]?.[
              node.loc.end.column - 1
            ] !== ')' ||
            right.loc.end.line >= node.loc.end.line
          : !same(right.loc.end, node.loc.end)) ||
        node.loc.end.line >= next.loc.start.line ||
        !same(
          models[0].loc.end,
          parenthesized
            ? fragment
              ? { line: node.loc.end.line, column: Infinity }
              : node.loc.end
            : end
        ) ||
        !same(models[0].locations[0].end, node.left!.loc.end) ||
        !same(models[0].locations[1].end, end) ||
        !same(branches[0].loc.end, end) ||
        !same(branches[0].locations[1].end, end) ||
        branches[0].locations[0].end.line !== node.left!.loc.end.line ||
        branches[0].locations[0].end.column !== Infinity ||
        originalNodes.filter(
          (other) =>
            other.type === node.type && same(other.loc.start, node.loc.start)
        ).length !== 1
      )
        fail()
      const matches = generatedNodes.filter(
        (candidate) =>
          candidate.type === node.type &&
          candidate.operator === node.operator &&
          candidate.left?.type === 'Identifier' &&
          candidate.left.name === node.left!.name &&
          exact(candidate.left.loc.start, node.left!.loc.start) &&
          candidate.right &&
          element(right, candidate.right)
      )
      if (matches.length !== 1) fail()
      const generated = matches[0]
      const generatedOwners = generatedNodes.filter((candidate) => {
        const children = candidate.arguments?.[1]?.properties?.filter(
          (property) =>
            property.type === 'Property' &&
            property.key?.type === 'Identifier' &&
            property.key.name === 'children'
        )
        const value = children?.[0]?.value as Node | undefined
        return (
          element(owner, candidate) &&
          candidate.arguments?.[1]?.type === 'ObjectExpression' &&
          children?.length === 1 &&
          value?.type === 'ArrayExpression' &&
          value.elements?.length === 2 &&
          value.elements[0] === generated &&
          value.elements[1] &&
          jsxCallName(value.elements[1]) ===
            (mode === 'development' ? 'jsxDEV' : 'jsx') &&
          element(next!, value.elements[1]) &&
          terminal(next!, value.elements[1])
        )
      })
      const following = mappings.find(
        (mapping) =>
          mapping.source !== null &&
          compare(mapping.generated, generated.right!.loc.end) >= 0
      )
      if (
        generatedOwners.length !== 1 ||
        jsxCallName(generatedOwners[0]) !==
          (mode === 'development' ? 'jsxDEV' : 'jsxs') ||
        jsxCallName(generated.right!) !==
          (mode === 'development' ? 'jsxDEV' : 'jsx') ||
        !terminal(right, generated.right!) ||
        !terminal(owner, generatedOwners[0]) ||
        !following ||
        following.source !== file ||
        !same(following.original, next!.loc.start) ||
        compare(following.generated, generatedOwners[0].loc.end) >= 0 ||
        !exact(following.generated, next!.loc.start)
      )
        fail()
      // The observed closing call and next sibling bind the endpoint for
      // the measured Fragment/element child and its authored parentheses.
      if (mode === 'development') {
        for (const location of [
          models[0].loc,
          models[0].locations[1],
          branches[0].loc,
          branches[0].locations[1],
        ])
          fragmentRepairs.push({ location, end: tag!.loc.start })
      } else fragmentRepairs.push({ location: models[0].loc, end })
      used.add(branches[0])
      continue
    }
    if (branches.length === 1 && branches[0].loc.end.column === Infinity)
      continue
    if (owners.length === 1 && owners[0].type === 'JSXFragment') {
      const owner = owners[0]
      const next = owner.children?.[1]
      const tag = next?.openingElement?.name
      if (
        (mode !== 'development' && mode !== 'production') ||
        branches.length !== 1 ||
        used.has(branches[0]) ||
        owner.children?.length !== 2 ||
        owner.children[0] !== containers[0] ||
        next?.type !== 'JSXElement' ||
        tag?.type !== 'JSXIdentifier' ||
        owner.loc.start.line !== owner.loc.end.line ||
        !same(branches[0].loc.end, next.loc.start) ||
        !same(branches[0].locations[1].end, next.loc.start) ||
        !same(branches[0].locations[0].end, right.loc.start) ||
        originalNodes.filter(
          (other) =>
            other.type === node.type && same(other.loc.start, node.loc.start)
        ).length !== 1
      )
        fail()
      const matches = generatedNodes.filter(
        (candidate) =>
          candidate.type === node.type &&
          candidate.operator === node.operator &&
          candidate.left?.type === 'Identifier' &&
          candidate.left.name === node.left!.name &&
          exact(candidate.left.loc.start, node.left!.loc.start) &&
          candidate.right &&
          element(right, candidate.right)
      )
      if (matches.length !== 1) fail()
      const generated = matches[0]
      const generatedOwners = generatedNodes.filter((candidate) => {
        const children = candidate.arguments?.[1]?.properties?.filter(
          (property) =>
            property.type === 'Property' &&
            property.key?.type === 'Identifier' &&
            property.key.name === 'children'
        )
        const value = children?.[0]?.value as Node | undefined
        return (
          element(owner, candidate) &&
          candidate.arguments?.[1]?.type === 'ObjectExpression' &&
          children?.length === 1 &&
          value?.type === 'ArrayExpression' &&
          value.elements?.length === 2 &&
          value.elements[0] === generated &&
          value.elements[1] &&
          jsxCallName(value.elements[1]) ===
            (mode === 'development' ? 'jsxDEV' : 'jsx') &&
          element(next!, value.elements[1])
        )
      })
      const following = mappings.find(
        (mapping) =>
          mapping.source !== null &&
          compare(mapping.generated, generated.right!.loc.end) >= 0
      )
      if (
        generatedOwners.length !== 1 ||
        jsxCallName(generatedOwners[0]) !==
          (mode === 'development' ? 'jsxDEV' : 'jsxs') ||
        jsxCallName(generated.right!) !==
          (mode === 'development' ? 'jsxDEV' : 'jsx') ||
        !terminal(right, generated.right!) ||
        !terminal(owner, generatedOwners[0]) ||
        !following ||
        following.source !== file ||
        !same(following.original, next!.loc.start) ||
        compare(following.generated, generatedOwners[0].loc.end) >= 0 ||
        !exact(following.generated, next!.loc.start)
      )
        fail()
      // The genuine development transform continues the next tag on the
      // logical call's final generated line; production ends at its opening.
      // Both endpoints come from this uniquely linked authored sibling.
      const end = mode === 'development' ? tag!.loc.start : next!.loc.start
      fragmentRepairs.push(
        { location: branches[0].loc, end },
        { location: branches[0].locations[1], end }
      )
      used.add(branches[0])
      continue
    }
    if (
      branches.length !== 1 ||
      used.has(branches[0]) ||
      owners.length !== 1 ||
      owners[0].loc.start.line !== owners[0].loc.end.line ||
      !owners[0].closingElement ||
      !same(owners[0].closingElement.loc.end, owners[0].loc.end) ||
      originalNodes.filter(
        (other) =>
          other.type === node.type && same(other.loc.start, node.loc.start)
      ).length !== 1
    )
      fail()
    const owner = owners[0]
    const borrowed = {
      line: owner.loc.end.line,
      column: owner.loc.end.column - 1,
    }
    if (
      !same(branches[0].loc.end, borrowed) ||
      !same(branches[0].locations[1].end, borrowed) ||
      !same(branches[0].locations[0].end, right.loc.start)
    )
      fail()
    const matches = generatedNodes.filter(
      (candidate) =>
        candidate.type === node.type &&
        candidate.operator === node.operator &&
        candidate.left?.type === 'Identifier' &&
        candidate.left.name === node.left!.name &&
        exact(candidate.left.loc.start, node.left!.loc.start) &&
        candidate.right &&
        element(right, candidate.right)
    )
    if (matches.length !== 1) fail()
    const generated = matches[0]
    const generatedOwners = generatedNodes.filter(
      (candidate) =>
        element(owner, candidate) &&
        candidate.arguments?.[1]?.type === 'ObjectExpression' &&
        candidate.arguments[1].properties?.filter(
          (property) =>
            property.type === 'Property' &&
            property.key?.type === 'Identifier' &&
            property.key.name === 'children' &&
            property.value === generated
        ).length === 1
    )
    const following = mappings.find(
      (mapping) =>
        mapping.source !== null &&
        compare(mapping.generated, generated.right!.loc.end) >= 0
    )
    if (
      generatedOwners.length !== 1 ||
      !terminal(right, generated.right!) ||
      !following ||
      following.source !== file ||
      !same(following.original, borrowed) ||
      compare(following.generated, generatedOwners[0].loc.end) >= 0 ||
      !exact(following.generated, borrowed)
    )
      fail()
    used.add(branches[0])
    repairs.push(branches[0].loc, branches[0].locations[1])
  }
  for (const location of repairs)
    location.end = { line: location.end.line!, column: Infinity }
  for (const { location, end } of fragmentRepairs) location.end = { ...end }
}

function classicFactoryCall(
  call: Node,
  factory: BrowserClassicFactory
): boolean {
  const callee = call.callee
  if (factory.namedPragma) {
    const sequence = callee?.expressions,
      member = sequence?.[1]
    return (
      callee?.type === 'SequenceExpression' &&
      sequence?.length === 2 &&
      sequence[0].type === 'Literal' &&
      sequence[0].value === 0 &&
      member?.type === 'MemberExpression' &&
      member.computed === true &&
      !member.optional &&
      member.object?.type === 'Identifier' &&
      member.object.name === factory.binding &&
      member.property?.type === 'Literal' &&
      member.property.value === 'createElement'
    )
  }
  const namespace = callee?.object
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    !callee.optional &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'createElement' &&
    namespace?.type === 'MemberExpression' &&
    namespace.computed === true &&
    !namespace.optional &&
    namespace.object?.type === 'Identifier' &&
    namespace.object.name === factory.binding &&
    namespace.property?.type === 'Literal' &&
    namespace.property.value === 'default'
  )
}

function classicFragmentArgument(
  node: Node | undefined,
  factory: BrowserClassicFactory
): boolean {
  return (
    !!factory.namedPragma?.fragment &&
    node?.type === 'MemberExpression' &&
    node.computed === true &&
    !node.optional &&
    node.object?.type === 'Identifier' &&
    node.object.name === factory.binding &&
    node.property?.type === 'Literal' &&
    node.property.value === 'Fragment'
  )
}

/** Only an issued named JSX factory may replace its actual directive's callee role. */
export function browserNamedJsxRoleMap(
  file: string,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown,
  factories: readonly BrowserClassicFactory[] | undefined
): object | undefined {
  if (!factories?.some((factory) => factory.namedPragma)) return undefined
  const fail = (): never => {
    throw new Error(
      `Standard coverage named JSX factory role is ambiguous or absent: ${file}`
    )
  }
  if (factories.length !== 1 || !factories[0].namedPragma) fail()
  const factory = factories[0],
    pragma = factory.namedPragma!
  const decoded = decodeCoverageMap(sourceMap),
    { exact } = facts(file, sourceMap)
  const generated = nodes(emitted),
    originals = nodes(authored)
  const replacements = new Map<object, Point>(),
    used = new Set<Node>()
  for (const owner of originals.filter((node) =>
    ['JSXElement', 'JSXFragment'].includes(node.type)
  )) {
    const fragment = owner.type === 'JSXFragment'
    const tag = owner.openingElement?.name,
      child = owner.children?.[0]
    if (
      (fragment
        ? !pragma.fragment ||
          !same(owner.openingFragment?.loc.start, owner.loc.start)
        : owner.openingElement?.attributes?.length !== 0 ||
          tag?.type !== 'JSXIdentifier' ||
          typeof tag.name !== 'string' ||
          !/^[a-z][a-z0-9]*$/.test(tag.name)) ||
      owner.children?.length !== 1
    )
      fail()
    const conditional =
      child?.type === 'JSXExpressionContainer' &&
      child.expression?.type === 'ConditionalExpression'
        ? child.expression
        : undefined
    const matches = generated.filter((call) => {
      const args = call.arguments,
        actualChild = args?.[2]
      return (
        call.type === 'CallExpression' &&
        !call.optional &&
        Number.isSafeInteger(call.start) &&
        Number.isSafeInteger(call.end) &&
        call.start! >= factory.moduleStart &&
        call.end! <= factory.moduleEnd &&
        classicFactoryCall(call, factory) &&
        args?.length === 3 &&
        (fragment
          ? classicFragmentArgument(args[0], factory)
          : args[0].type === 'Literal' && args[0].value === tag!.name) &&
        args[1].type === 'Literal' &&
        args[1].value === null &&
        exact(call.loc.start, owner.loc.start) &&
        (fragment || exact(args[0].loc.start, tag!.loc.start)) &&
        (conditional
          ? actualChild?.type === 'ConditionalExpression' &&
            conditional.test?.type === 'Identifier' &&
            actualChild.test?.type === 'Identifier' &&
            actualChild.test.name === conditional.test.name &&
            exact(actualChild.loc.start, conditional.loc.start) &&
            exact(actualChild.test.loc.start, conditional.test.loc.start) &&
            conditional.consequent?.type === 'Literal' &&
            typeof conditional.consequent.value === 'string' &&
            actualChild.consequent?.type === 'Literal' &&
            actualChild.consequent.value === conditional.consequent.value &&
            exact(
              actualChild.consequent.loc.start,
              conditional.consequent.loc.start
            ) &&
            conditional.alternate?.type === 'Literal' &&
            typeof conditional.alternate.value === 'string' &&
            actualChild.alternate?.type === 'Literal' &&
            actualChild.alternate.value === conditional.alternate.value &&
            exact(
              actualChild.alternate.loc.start,
              conditional.alternate.loc.start
            )
          : child?.type === 'JSXText' &&
            actualChild?.type === 'Literal' &&
            actualChild.value === child.value &&
            exact(actualChild.loc.start, child.loc.start))
      )
    })
    if (matches.length !== 1 || used.has(matches[0])) fail()
    const call = matches[0]
    const binds = (node: Node | undefined): boolean =>
      !!node &&
      ((node.type === 'Identifier' && node.name === factory.binding) ||
        (node.type === 'AssignmentPattern' && binds(node.left)) ||
        (node.type === 'RestElement' && binds(node.argument)) ||
        (node.type === 'ObjectPattern' &&
          !!node.properties?.some((property) =>
            binds(
              property.type === 'RestElement'
                ? property.argument
                : (property.value as Node)
            )
          )) ||
        (node.type === 'ArrayPattern' &&
          !!node.elements?.some((element) => binds(element ?? undefined))))
    if (
      generated.some(
        (scope) =>
          [
            'FunctionDeclaration',
            'FunctionExpression',
            'ArrowFunctionExpression',
          ].includes(scope.type) &&
          scope.start! >= factory.moduleStart &&
          scope.end! <= factory.moduleEnd &&
          scope.start! <= call.start! &&
          scope.end! >= call.end! &&
          (binds(scope.id) || scope.params?.some(binds))
      )
    )
      fail()
    const callee = call.callee!,
      member = callee.expressions![1]
    const mappings = decoded.mappings.filter((mapping) => {
      const at = {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      }
      return (
        compare(at, callee.loc.start) >= 0 && compare(at, callee.loc.end) <= 0
      )
    })
    if (mappings.length !== 2) fail()
    for (const [index, mapping] of mappings.entries()) {
      const at = {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      }
      if (
        mapping.source !== file ||
        !same(at, index === 0 ? member.loc.start : callee.loc.end) ||
        !same(
          { line: mapping.originalLine!, column: mapping.originalColumn! },
          index === 0 ? pragma.start : pragma.end
        ) ||
        replacements.has(mapping)
      )
        fail()
      replacements.set(mapping, {
        line: owner.loc.start.line!,
        column: owner.loc.start.column!,
      })
    }
    if (fragment) {
      const argument = call.arguments![0]
      const roles = decoded.mappings.filter((mapping) => {
        const at = {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        }
        return (
          compare(at, argument.loc.start) >= 0 &&
          compare(at, argument.loc.end) <= 0
        )
      })
      if (roles.length !== 2) fail()
      for (const [index, mapping] of roles.entries()) {
        if (
          mapping.source !== file ||
          !same(
            { line: mapping.generatedLine, column: mapping.generatedColumn },
            index === 0 ? argument.loc.start : argument.loc.end
          ) ||
          !same(
            { line: mapping.originalLine!, column: mapping.originalColumn! },
            index === 0 ? pragma.fragment!.start : pragma.fragment!.end
          ) ||
          replacements.has(mapping)
        )
          fail()
        replacements.set(mapping, {
          line: owner.loc.start.line!,
          column: owner.loc.start.column!,
        })
      }
    }
    used.add(call)
  }
  if (!used.size) fail()
  const output = new SourceMapGenerator()
  for (const mapping of decoded.mappings) {
    const position = {
      line: mapping.generatedLine,
      column: mapping.generatedColumn,
    }
    if (mapping.source === null)
      (output.addMapping as (mapping: { generated: Point }) => void)({
        generated: position,
      })
    else
      output.addMapping({
        generated: position,
        source: mapping.source,
        original: replacements.get(mapping) ?? {
          line: mapping.originalLine!,
          column: mapping.originalColumn!,
        },
        ...((mapping as { name?: string }).name
          ? { name: (mapping as { name?: string }).name }
          : {}),
      })
  }
  for (const [source, content] of decoded.sources)
    if (content !== null) output.setSourceContent(source, content)
  return JSON.parse(output.toString())
}

/** A classic child endpoint belongs to its issued native React factory and JSX close. */
export function bindJsxClassicConditionalChildEnds(
  file: string,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown,
  factories: readonly BrowserClassicFactory[] | undefined
): void {
  if (!factories?.length) return
  const { exact } = facts(file, sourceMap)
  const originals = nodes(authored),
    generated = nodes(emitted)
  const repairs: {
    branch: StandardCoverageData['branchMap'][string]
    end: Point
    before: string
    after: string
    id: number
  }[] = []
  const used = new Set<StandardCoverageData['branchMap'][string]>()
  const key = (branch: StandardCoverageData['branchMap'][string]) =>
    `b:${branch.locations.flatMap(({ start, end }) => [start.line, start.column, end.line, end.column]).join(':')}`
  for (const owner of originals) {
    if (owner.type !== 'JSXElement') continue
    const container = owner.children?.[0],
      conditional = container?.expression
    if (
      owner.children?.length !== 1 ||
      container?.type !== 'JSXExpressionContainer' ||
      conditional?.type !== 'ConditionalExpression' ||
      conditional.test?.type !== 'Identifier' ||
      conditional.consequent?.type !== 'Literal' ||
      typeof conditional.consequent.value !== 'string' ||
      conditional.alternate?.type !== 'Literal' ||
      typeof conditional.alternate.value !== 'string' ||
      conditional.consequent.value === conditional.alternate.value
    )
      continue
    const branches = Object.entries(observed.branchMap).filter(
      ([, branch]) =>
        branch.type === 'cond-expr' &&
        same(branch.loc.start, conditional.loc.start) &&
        branch.locations.length === 2 &&
        same(branch.locations[0].start, conditional.consequent!.loc.start) &&
        same(branch.locations[1].start, conditional.alternate!.loc.start)
    )
    if (
      !branches.length ||
      branches.every(([, branch]) => branch.loc.end.column !== Infinity)
    )
      continue
    function fail(): never {
      throw new Error(
        `Standard coverage classic JSX child association is ambiguous or absent: ${file}:${conditional!.loc.start.line}:${conditional!.loc.start.column}`
      )
    }
    const opening = owner.openingElement,
      tag = opening?.name,
      closing = owner.closingElement,
      closingName = closing?.name
    if (
      factories.length !== 1 ||
      branches.length !== 1 ||
      used.has(branches[0][1]) ||
      opening?.attributes?.length !== 0 ||
      tag?.type !== 'JSXIdentifier' ||
      typeof tag.name !== 'string' ||
      !/^[a-z][a-z0-9]*$/.test(tag.name) ||
      closing?.type !== 'JSXClosingElement' ||
      closingName?.type !== 'JSXIdentifier' ||
      closingName.name !== tag.name ||
      !same(closing.loc.end, owner.loc.end) ||
      closingName.loc.end.line !== owner.loc.end.line ||
      closingName.loc.end.column + 1 !== owner.loc.end.column ||
      owner.loc.start.line !== owner.loc.end.line ||
      conditional.loc.start.line !== owner.loc.end.line ||
      conditional.loc.end.line !== owner.loc.end.line ||
      originals.filter(
        (node) =>
          node.type === owner.type && same(node.loc.start, owner.loc.start)
      ).length !== 1 ||
      originals.filter(
        (node) =>
          node.type === conditional.type &&
          same(node.loc.start, conditional.loc.start)
      ).length !== 1
    )
      fail()
    const factory = factories[0]
    if (
      typeof factory.binding !== 'string' ||
      !factory.binding ||
      !Number.isSafeInteger(factory.moduleStart) ||
      !Number.isSafeInteger(factory.moduleEnd) ||
      factory.moduleStart < 0 ||
      factory.moduleEnd <= factory.moduleStart
    )
      fail()
    const matches = generated.filter((call) => {
      const args = call.arguments,
        child = args?.[2]
      return (
        call.type === 'CallExpression' &&
        !call.optional &&
        Number.isSafeInteger(call.start) &&
        Number.isSafeInteger(call.end) &&
        call.start! >= factory.moduleStart &&
        call.end! <= factory.moduleEnd &&
        classicFactoryCall(call, factory) &&
        args?.length === 3 &&
        args[0].type === 'Literal' &&
        args[0].value === tag!.name &&
        args[1].type === 'Literal' &&
        args[1].value === null &&
        child?.type === 'ConditionalExpression' &&
        child.test?.type === 'Identifier' &&
        child.test.name === conditional.test!.name &&
        child.consequent?.type === 'Literal' &&
        child.consequent.value === conditional.consequent!.value &&
        child.alternate?.type === 'Literal' &&
        child.alternate.value === conditional.alternate!.value &&
        exact(call.loc.start, owner.loc.start) &&
        exact(args[0].loc.start, tag!.loc.start) &&
        exact(child.loc.start, conditional.loc.start) &&
        exact(child.test.loc.start, conditional.test!.loc.start) &&
        exact(child.consequent.loc.start, conditional.consequent!.loc.start) &&
        exact(child.alternate.loc.start, conditional.alternate!.loc.start)
      )
    })
    if (matches.length !== 1) fail()
    const [id, branch] = branches[0],
      end = { ...closingName!.loc.end }
    if (
      branch.loc.end.line !== owner.loc.end.line ||
      branch.loc.end.column !== Infinity ||
      !same(branch.locations[0].end, conditional.alternate.loc.start) ||
      branch.locations[1].end.line !== owner.loc.end.line ||
      branch.locations[1].end.column !== Infinity
    )
      fail()
    const before = key(branch),
      after = key({
        ...branch,
        locations: [branch.locations[0], { ...branch.locations[1], end }],
      })
    if (
      observed.meta &&
      (observed.meta.seen[before] !== Number(id) ||
        (Object.hasOwn(observed.meta.seen, after) && before !== after))
    )
      fail()
    repairs.push({ branch, end, before, after, id: Number(id) })
    used.add(branch)
  }
  for (const { branch, end, before, after, id } of repairs) {
    branch.loc.end = { ...end }
    branch.locations[1].end = { ...end }
    if (observed.meta) {
      delete observed.meta.seen[before]
      observed.meta.seen[after] = id
    }
  }
}

/** A named fragment child ends only at its actual issued fragment close. */
export function bindJsxNamedFragmentConditionalChildEnds(
  file: string,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown,
  factories: readonly BrowserClassicFactory[] | undefined
): void {
  if (!factories?.some((factory) => factory.namedPragma?.fragment)) return
  const { exact } = facts(file, sourceMap)
  const originals = nodes(authored),
    generated = nodes(emitted)
  const repairs: {
    branch: StandardCoverageData['branchMap'][string]
    end: Point
    before: string
    after: string
    id: number
  }[] = []
  const used = new Set<StandardCoverageData['branchMap'][string]>()
  const key = (branch: StandardCoverageData['branchMap'][string]) =>
    `b:${branch.locations.flatMap(({ start, end }) => [start.line, start.column, end.line, end.column]).join(':')}`
  for (const owner of originals) {
    if (owner.type !== 'JSXFragment') continue
    const container = owner.children?.[0],
      conditional = container?.expression
    if (
      owner.children?.length !== 1 ||
      container?.type !== 'JSXExpressionContainer' ||
      conditional?.type !== 'ConditionalExpression' ||
      conditional.test?.type !== 'Identifier' ||
      conditional.consequent?.type !== 'Literal' ||
      typeof conditional.consequent.value !== 'string' ||
      conditional.alternate?.type !== 'Literal' ||
      typeof conditional.alternate.value !== 'string' ||
      conditional.consequent.value === conditional.alternate.value
    )
      continue
    const branches = Object.entries(observed.branchMap).filter(
      ([, branch]) =>
        branch.type === 'cond-expr' &&
        same(branch.loc.start, conditional.loc.start) &&
        branch.locations.length === 2 &&
        same(branch.locations[0].start, conditional.consequent!.loc.start) &&
        same(branch.locations[1].start, conditional.alternate!.loc.start)
    )
    if (
      !branches.length ||
      branches.every(([, branch]) => branch.loc.end.column !== Infinity)
    )
      continue
    function fail(): never {
      throw new Error(
        `Standard coverage classic JSX fragment child association is ambiguous or absent: ${file}:${conditional!.loc.start.line}:${conditional!.loc.start.column}`
      )
    }
    const opening = owner.openingFragment,
      closing = owner.closingFragment
    if (
      factories.length !== 1 ||
      branches.length !== 1 ||
      used.has(branches[0][1]) ||
      opening?.type !== 'JSXOpeningFragment' ||
      closing?.type !== 'JSXClosingFragment' ||
      closing.loc.start.line !== closing.loc.end.line ||
      closing.loc.end.column - closing.loc.start.column !== 3 ||
      !Number.isSafeInteger(closing.start) ||
      !Number.isSafeInteger(closing.end) ||
      closing.end! - closing.start! !== 3 ||
      !same(opening.loc.start, owner.loc.start) ||
      !same(closing.loc.end, owner.loc.end) ||
      owner.loc.start.line !== owner.loc.end.line ||
      conditional.loc.start.line !== owner.loc.end.line ||
      conditional.loc.end.line !== owner.loc.end.line ||
      originals.filter(
        (node) =>
          node.type === owner.type && same(node.loc.start, owner.loc.start)
      ).length !== 1 ||
      originals.filter(
        (node) =>
          node.type === conditional.type &&
          same(node.loc.start, conditional.loc.start)
      ).length !== 1
    )
      fail()
    const factory = factories[0]
    if (
      !factory.namedPragma?.fragment ||
      typeof factory.binding !== 'string' ||
      !factory.binding ||
      !Number.isSafeInteger(factory.moduleStart) ||
      !Number.isSafeInteger(factory.moduleEnd) ||
      factory.moduleStart < 0 ||
      factory.moduleEnd <= factory.moduleStart
    )
      fail()
    const matches = generated.filter((call) => {
      const args = call.arguments,
        child = args?.[2]
      return (
        call.type === 'CallExpression' &&
        !call.optional &&
        Number.isSafeInteger(call.start) &&
        Number.isSafeInteger(call.end) &&
        call.start! >= factory.moduleStart &&
        call.end! <= factory.moduleEnd &&
        classicFactoryCall(call, factory) &&
        args?.length === 3 &&
        classicFragmentArgument(args[0], factory) &&
        args[1].type === 'Literal' &&
        args[1].value === null &&
        child?.type === 'ConditionalExpression' &&
        child.test?.type === 'Identifier' &&
        child.test.name === conditional.test!.name &&
        child.consequent?.type === 'Literal' &&
        child.consequent.value === conditional.consequent!.value &&
        child.alternate?.type === 'Literal' &&
        child.alternate.value === conditional.alternate!.value &&
        exact(call.loc.start, owner.loc.start) &&
        exact(args[0].loc.start, owner.loc.start) &&
        exact(child.loc.start, conditional.loc.start) &&
        exact(child.test.loc.start, conditional.test!.loc.start) &&
        exact(child.consequent.loc.start, conditional.consequent!.loc.start) &&
        exact(child.alternate.loc.start, conditional.alternate!.loc.start)
      )
    })
    if (matches.length !== 1) fail()
    const [id, branch] = branches[0],
      end = { line: closing!.loc.end.line, column: closing!.loc.end.column - 1 }
    if (
      branch.loc.end.line !== owner.loc.end.line ||
      branch.loc.end.column !== Infinity ||
      !same(branch.locations[0].end, conditional.alternate.loc.start) ||
      branch.locations[1].end.line !== owner.loc.end.line ||
      branch.locations[1].end.column !== Infinity
    )
      fail()
    const before = key(branch),
      after = key({
        ...branch,
        locations: [branch.locations[0], { ...branch.locations[1], end }],
      })
    if (
      observed.meta &&
      (observed.meta.seen[before] !== Number(id) ||
        (Object.hasOwn(observed.meta.seen, after) && before !== after))
    )
      fail()
    repairs.push({ branch, end, before, after, id: Number(id) })
    used.add(branch)
  }
  for (const { branch, end, before, after, id } of repairs) {
    branch.loc.end = { ...end }
    branch.locations[1].end = { ...end }
    if (observed.meta) {
      delete observed.meta.seen[before]
      observed.meta.seen[after] = id
    }
  }
}
