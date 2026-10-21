import { decodeCoverageMap } from './maps'
import type { ArrowBindingAssociation } from './arrow-bindings'
import type { StandardCoverageData, StandardCoverageLocation } from './types'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc: StandardCoverageLocation
  start?: number
  extra?: { parenthesized?: boolean; parenStart?: number }
  name?: string
  value?: unknown
  operator?: string
  left?: Node
  right?: Node
  body?: Node
  expression?: Node
  openingElement?: { name?: Node }
  closingElement?: Node
  closingFragment?: Node
  children?: Node[]
  arguments?: Node[]
  argument?: Node
  properties?: Node[]
  elements?: (Node | null)[]
  property?: Node
  computed?: boolean
  callee?: Node
  expressions?: Node[]
  key?: Node
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
  model?: StandardCoverageData
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
