import { decodeCoverageMap } from './maps'
import type { StandardCoverageData } from './types'

type Node = { type: string; start: number; end: number; [key: string]: any }

export type BrowserCreatorScope = {
  binding: string
  moduleStart: number
  moduleEnd: number
}

export type BrowserCreatorMethod = {
  scope: BrowserCreatorScope
  method: Node
  owner: Node
}

function fail(): never {
  throw new Error('Unsupported or ambiguous native Browser creator coverage')
}

function walk(
  value: unknown,
  visit: (node: Node, parents: Node[]) => void,
  parents: Node[] = []
) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parents)
    return
  }
  const node = value as Node
  const next = typeof node.type === 'string' ? [...parents, node] : parents
  if (typeof node.type === 'string') visit(node, parents)
  for (const [name, child] of Object.entries(node))
    if (!['loc', 'comments', 'tokens'].includes(name)) walk(child, visit, next)
}

/** Only a validated native private-bridge role may authorize these exact nodes. */
export function normalizeBrowserCreatorScopes(
  input: unknown,
  scopes: readonly BrowserCreatorScope[]
): { ast: unknown; methods: readonly BrowserCreatorMethod[] } {
  if (!scopes.length) return { ast: input, methods: [] }
  const ast = structuredClone(input)
  const methods: BrowserCreatorMethod[] = []
  const remove = new Set<Node>(),
    replacements = new Map<Node, Node[]>()
  for (const scope of scopes) {
    if (
      typeof scope.binding !== 'string' ||
      !scope.binding ||
      !Number.isSafeInteger(scope.moduleStart) ||
      scope.moduleStart < 0 ||
      !Number.isSafeInteger(scope.moduleEnd) ||
      scope.moduleEnd <= scope.moduleStart
    )
      fail()
    const rows: { node: Node; parents: Node[] }[] = []
    walk(ast, (node, parents) => {
      if (node.start >= scope.moduleStart && node.end <= scope.moduleEnd)
        rows.push({ node, parents })
    })
    if (!scope.binding || !rows.length || scope.moduleEnd <= scope.moduleStart)
      fail()
    const allowedNamespace = new Set<Node>()
    const helper = (call: Node, name: string) => {
      if (call?.type !== 'CallExpression' || call.optional) return false
      const callee = call.callee
      if (
        callee?.type !== 'SequenceExpression' ||
        callee.expressions.length !== 2 ||
        callee.expressions[0].type !== 'Literal' ||
        callee.expressions[0].value !== 0
      )
        return false
      const member = callee.expressions[1]
      if (
        member?.type !== 'MemberExpression' ||
        !member.computed ||
        member.optional ||
        member.object?.type !== 'Identifier' ||
        member.object.name !== scope.binding ||
        member.property?.type !== 'Literal' ||
        member.property.value !== name
      )
        return false
      allowedNamespace.add(member.object)
      return true
    }
    const captures: {
      declaration: Node
      id: Node
      parent: Node
      references: Set<Node>
      owner?: Node
      uses: number
    }[] = []
    const entries: {
      declaration: Node
      id: Node
      argument: Node
      body: Node
      fn: Node
      method?: Node
      owner?: Node
    }[] = []
    for (const { node, parents } of rows) {
      if (node.type !== 'VariableDeclaration' || node.declarations.length !== 1)
        continue
      const declaration = node.declarations[0]
      if (helper(declaration.init, 'captureCreatorScope')) {
        const parent = parents.at(-1)
        if (
          node.kind !== 'const' ||
          declaration.id?.type !== 'Identifier' ||
          declaration.init.arguments.length !== 0 ||
          parent?.type !== 'BlockStatement'
        )
          fail()
        captures.push({
          declaration: node,
          id: declaration.id,
          parent,
          references: new Set([declaration.id]),
          uses: 0,
        })
      } else if (helper(declaration.init, 'enterCreatorScope')) {
        const body = parents.at(-1),
          fn = parents.at(-2)
        if (
          node.kind !== 'const' ||
          declaration.id?.type !== 'Identifier' ||
          declaration.init.arguments.length !== 1 ||
          declaration.init.arguments[0]?.type !== 'Identifier' ||
          body?.type !== 'BlockStatement' ||
          fn?.body !== body ||
          ![
            'FunctionDeclaration',
            'FunctionExpression',
            'ArrowFunctionExpression',
          ].includes(fn.type)
        )
          fail()
        entries.push({
          declaration: node,
          id: declaration.id,
          argument: declaration.init.arguments[0],
          body,
          fn,
          method: parents.at(-3),
          owner: parents.at(-5),
        })
      }
    }
    if (!captures.length || !entries.length) fail()
    const names = captures.map((value) => value.id.name)
    if (
      new Set(names).size !== names.length ||
      names.includes(scope.binding) ||
      entries.some(
        (value) =>
          names.includes(value.id.name) || value.id.name === scope.binding
      )
    )
      fail()
    const leaves = new Map<string, Set<Node>>()
    for (const entry of entries) {
      const matches = captures.filter(
        (value) => value.id.name === entry.argument.name
      )
      if (matches.length !== 1) fail()
      const capture = matches[0],
        index = entry.body.body.indexOf(entry.declaration)
      if (
        index < 0 ||
        entry.body.body.length !== index + 2 ||
        entry.body.body
          .slice(0, index)
          .some(
            (value: Node) =>
              value.type !== 'ExpressionStatement' ||
              value.expression?.type !== 'Literal' ||
              typeof value.expression.value !== 'string'
          )
      )
        fail()
      const transaction = entry.body.body[index + 1]
      if (
        transaction.type !== 'TryStatement' ||
        transaction.handler !== null ||
        transaction.block?.type !== 'BlockStatement' ||
        transaction.finalizer?.type !== 'BlockStatement' ||
        transaction.finalizer.body.length !== 1
      )
        fail()
      const final = transaction.finalizer.body[0]
      if (
        final.type !== 'ExpressionStatement' ||
        final.expression?.type !== 'CallExpression' ||
        final.expression.optional ||
        final.expression.arguments.length !== 0 ||
        final.expression.callee?.type !== 'Identifier' ||
        final.expression.callee.name !== entry.id.name
      )
        fail()
      const owner = capture.parent.body.filter(
        (value: Node) =>
          value.start <= entry.fn.start && value.end >= entry.fn.end
      )
      if (
        owner.length !== 1 ||
        owner[0].start < capture.declaration.end ||
        (capture.owner && capture.owner !== owner[0]) ||
        capture.parent.body
          .slice(
            capture.parent.body.indexOf(capture.declaration) + 1,
            capture.parent.body.indexOf(owner[0])
          )
          .some(
            (value: Node) =>
              !captures.some((other) => other.declaration === value)
          ) ||
        replacements.has(entry.body)
      )
        fail()
      if (
        entry.method?.type === 'MethodDefinition' &&
        entry.method.value === entry.fn &&
        entry.method.kind === 'method' &&
        !entry.method.computed &&
        entry.method.key?.type === 'Identifier' &&
        entry.owner &&
        ['ClassDeclaration', 'ClassExpression'].includes(entry.owner.type) &&
        entry.owner.body?.body.includes(entry.method)
      )
        methods.push({ scope, method: entry.method, owner: entry.owner })
      capture.owner = owner[0]
      capture.uses++
      capture.references.add(entry.argument)
      const references = leaves.get(entry.id.name) ?? new Set<Node>()
      references.add(entry.id)
      references.add(final.expression.callee)
      leaves.set(entry.id.name, references)
      replacements.set(entry.body, [
        ...entry.body.body.slice(0, index),
        ...transaction.block.body,
      ])
    }
    for (const capture of captures) {
      if (!capture.uses) fail()
      remove.add(capture.declaration)
    }
    for (const { node } of rows) {
      if (node.type !== 'Identifier') continue
      if (node.name === scope.binding && !allowedNamespace.has(node)) fail()
      const capture = captures.find((value) => value.id.name === node.name)
      if (capture && !capture.references.has(node)) fail()
      const leave = leaves.get(node.name)
      if (leave && !leave.has(node)) fail()
    }
  }
  walk(ast, (node) => {
    if (node.type !== 'BlockStatement') return
    const body = replacements.get(node) ?? node.body
    node.body = body.filter((value: Node) => !remove.has(value))
  })
  return { ast, methods }
}

/** Retain a real converted endpoint only for its issued, mapped class method. */
export function bindBrowserCreatorMethodEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  methods: readonly BrowserCreatorMethod[],
  sourceMap: unknown
): void {
  if (!methods.length) return
  const decoded = decodeCoverageMap(sourceMap)
  type Point = { line: number; column: number }
  const same = (a: Point, b: Point) =>
    a.line === b.line && a.column === b.column
  const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
  const close = (node: Node): Point => {
    const end = node.loc?.end
    if (!end || !Number.isSafeInteger(end.column) || end.column < 1) fail()
    return { line: end.line, column: end.column - 1 }
  }
  const exact = (at: Point, expected: Point) => {
    const rows = decoded.mappings.filter(
      (mapping) =>
        mapping.generatedLine === at.line &&
        mapping.generatedColumn === at.column
    )
    return (
      rows.length > 0 &&
      rows.every(
        (mapping) =>
          mapping.source === file &&
          mapping.originalLine === expected.line &&
          mapping.originalColumn === expected.column
      )
    )
  }
  const originals: { method: Node; owner: Node }[] = []
  walk(authored, (method, parents) => {
    const owner = parents.at(-2)
    if (
      method.type === 'MethodDefinition' &&
      method.kind === 'method' &&
      !method.computed &&
      method.key?.type === 'Identifier' &&
      owner &&
      ['ClassDeclaration', 'ClassExpression'].includes(owner.type) &&
      owner.body?.body.includes(method)
    )
      originals.push({ method, owner })
  })
  const used = new Set<Node>(),
    usedModel = new Set<string>(),
    usedObserved = new Set<string>()
  const changes: {
    value: StandardCoverageData['fnMap'][string]
    end: Point
  }[] = []
  for (const actual of methods) {
    const { method, owner, scope } = actual
    if (
      owner.start < scope.moduleStart ||
      owner.end > scope.moduleEnd ||
      method.start < owner.start ||
      method.end > owner.end ||
      method.type !== 'MethodDefinition' ||
      method.kind !== 'method' ||
      method.computed ||
      method.key?.type !== 'Identifier' ||
      !['ClassDeclaration', 'ClassExpression'].includes(owner.type) ||
      !owner.body?.body.includes(method) ||
      method.value?.body?.type !== 'BlockStatement'
    )
      fail()
    const matches = originals.filter(
      (original) =>
        original.owner.type === owner.type &&
        original.method.key.name === method.key.name &&
        !!original.method.static === !!method.static &&
        exact(owner.loc.start, original.owner.loc.start) &&
        exact(method.key.loc.start, original.method.key.loc.start) &&
        exact(
          method.value.body.loc.start,
          original.method.value.body.loc.start
        ) &&
        exact(close(method.value.body), close(original.method.value.body)) &&
        exact(close(owner.body), close(original.owner.body))
    )
    if (matches.length !== 1 || used.has(matches[0].method)) fail()
    const original = matches[0]
    const expected = Object.entries(model.fnMap).filter(([, value]) =>
      same(value.decl.start, original.method.key.loc.start)
    )
    const received = Object.entries(observed.fnMap).filter(([, value]) =>
      same(value.decl.start, original.method.key.loc.start)
    )
    if (
      expected.length !== 1 ||
      received.length !== 1 ||
      usedModel.has(expected[0][0]) ||
      usedObserved.has(received[0][0])
    )
      fail()
    const next =
      original.owner.body.body[
        original.owner.body.body.indexOf(original.method) + 1
      ]
    const limit = next?.loc.start ?? close(original.owner.body)
    const before = expected[0][1],
      after = received[0][1]
    if (
      before.name !== original.method.key.name ||
      after.name !== before.name ||
      !same(before.loc.start, original.method.value.body.loc.start) ||
      !same(after.loc.start, before.loc.start)
    )
      fail()
    if (!same(before.loc.end, after.loc.end)) {
      if (
        !same(before.loc.end, original.method.value.body.loc.end) ||
        !Number.isSafeInteger(after.loc.end.line) ||
        !Number.isSafeInteger(after.loc.end.column) ||
        compare(after.loc.end, before.loc.end) < 0 ||
        compare(after.loc.end, limit) > 0
      )
        fail()
      changes.push({ value: before, end: { ...after.loc.end } })
    }
    used.add(original.method)
    usedModel.add(expected[0][0])
    usedObserved.add(received[0][0])
  }
  // No node, map or observed counter changes: only retain an already real endpoint.
  for (const change of changes) change.value.loc.end = change.end
}
