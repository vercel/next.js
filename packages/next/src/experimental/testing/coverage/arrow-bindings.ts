import { SourceMapGenerator } from 'next/dist/compiled/source-map'
import { decodeCoverageMap, type CoverageMapping } from './maps'
import type { StandardCoverageData } from './types'

type Point = { line: number; column: number }
type Node = {
  type: string
  loc: { start: Point; end: Point }
  id?: Node
  init?: Node
  body?: Node
  params?: Node[]
  arguments?: Node[]
  callee?: Node
  property?: Node
  key?: Node
  value?: unknown
  kind?: string
  computed?: boolean
  name?: string
  async?: boolean
  generator?: boolean
  static?: boolean
  declare?: boolean
  typeAnnotation?: Node
  argument?: Node
  operator?: string
}
export interface ArrowBindingAssociation {
  original: Node
  generated: Node
  start: Point
  property?: true
  callback?: true
  callbackEnd?: Point
  classField?: { original: Node; generated: Node }
}
const same = (a: Point, b: Point) => a.line === b.line && a.column === b.column
const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
const generated = (mapping: CoverageMapping): Point => ({
  line: mapping.generatedLine,
  column: mapping.generatedColumn,
})
const original = (mapping: CoverageMapping): Point => ({
  line: mapping.originalLine!,
  column: mapping.originalColumn!,
})
function walk(
  value: unknown,
  visit: (node: Node, parent?: Node) => void,
  parent?: Node
) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parent)
    return
  }
  const node = value as Node
  if (typeof node.type === 'string') visit(node, parent)
  for (const [key, child] of Object.entries(value))
    if (!['loc', 'comments', 'tokens'].includes(key)) walk(child, visit, node)
}

/** Link actual emitted bindings to authored arrows before changing display roles. */
export function associateArrowBindings(
  file: string,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown
): ArrowBindingAssociation[] {
  const mappings = decodeCoverageMap(sourceMap).mappings
  type Declaration = {
    binding?: Node
    property?: true
    arrow: Node
    callbackStart?: Point
    callbackEnd?: Point
    callbackNext?: Point
    field?: { node: Node; owner: Node }
  }
  const declarations: Declaration[] = []
  function classFields(ast: unknown) {
    const result = new Map<Node, { node: Node; owner: Node }>()
    walk(ast, (owner) => {
      if (
        owner.type !== 'ClassDeclaration' ||
        owner.id?.type !== 'Identifier' ||
        owner.body?.type !== 'ClassBody' ||
        !Array.isArray(owner.body.body)
      )
        return
      for (const node of owner.body.body as Node[]) {
        if (
          ['ClassProperty', 'PropertyDefinition'].includes(node.type) &&
          !node.computed &&
          !node.declare &&
          node.key?.type === 'Identifier' &&
          (node.value as Node)?.type === 'ArrowFunctionExpression'
        )
          result.set(node.value as Node, { node, owner })
      }
    })
    return result
  }
  const authoredFields = classFields(authored)
  const emittedFields = classFields(emitted)
  function failure(node: Node): never {
    throw new Error(
      `TypeScript arrow-function coverage requires compiler-qualified binding maps: ${file}:${node.loc.start.line}:${node.loc.start.column}`
    )
  }
  function callbackRoleStart(arrow: Node, parent: Node): Point | undefined {
    const callee = parent.callee
    let role: Point | undefined
    if (callee?.type === 'Identifier') role = callee.loc.start
    else if (callee?.type === 'MemberExpression')
      role = callee.computed
        ? callee.loc.end
        : callee.property?.type === 'Identifier'
          ? callee.property.loc.start
          : undefined
    if (!role) return undefined
    return arrow.async ||
      (arrow.params?.length === 1 &&
        same(arrow.loc.start, arrow.params[0].loc.start))
      ? arrow.loc.start
      : role
  }
  walk(authored, (arrow, parent) => {
    if (arrow.type !== 'ArrowFunctionExpression') return
    if (
      parent?.type === 'VariableDeclarator' &&
      parent.init === arrow &&
      parent.id?.type === 'Identifier'
    ) {
      declarations.push({ binding: parent.id, arrow })
    } else if (
      parent?.type === 'Property' &&
      parent.kind === 'init' &&
      parent.value === arrow &&
      !parent.computed &&
      (parent.key?.type === 'Identifier' ||
        (parent.key?.type === 'Literal' &&
          typeof parent.key.value === 'string'))
    ) {
      declarations.push({ binding: parent.key, property: true, arrow })
    } else if (authoredFields.has(arrow)) {
      const field = authoredFields.get(arrow)!
      if (
        arrow.async ||
        arrow.body?.type !== 'BinaryExpression' ||
        arrow.params?.some((parameter) => parameter.type !== 'Identifier') ||
        !same(arrow.body.loc.end, arrow.loc.end) ||
        compare(arrow.loc.end, field.node.loc.end) >= 0 ||
        field.node.loc.start.line !== arrow.loc.start.line ||
        arrow.loc.start.line !== arrow.body.loc.end.line ||
        arrow.loc.start.line !== field.node.loc.end.line
      )
        failure(arrow)
      declarations.push({ binding: field.node.key, arrow, field })
    } else if (
      parent?.type === 'CallExpression' &&
      parent.arguments?.includes(arrow)
    ) {
      const start = callbackRoleStart(arrow, parent)
      if (!start) failure(arrow)
      const index = parent.arguments!.indexOf(arrow)
      declarations.push({
        arrow,
        callbackStart: start,
        callbackNext: parent.arguments![index + 1]?.loc.start,
        callbackEnd:
          parent.arguments![index + 1]?.loc.start ?? arrow.body!.loc.end,
      })
    } else failure(arrow)
  })
  if (!declarations.length) return []
  const exact = (point: Point) => {
    const values = mappings.filter((mapping) => same(generated(mapping), point))
    if (!values.length || values.some((mapping) => mapping.source !== file))
      return undefined
    const position = original(values[0])
    return values.every((mapping) => same(original(mapping), position))
      ? position
      : undefined
  }
  const emittedDeclarations: Declaration[] = []
  walk(emitted, (arrow, parent) => {
    if (arrow.type !== 'ArrowFunctionExpression') return
    if (
      parent?.type === 'VariableDeclarator' &&
      parent.init === arrow &&
      parent.id?.type === 'Identifier'
    )
      emittedDeclarations.push({ binding: parent.id, arrow })
    else if (
      parent?.type === 'Property' &&
      parent.kind === 'init' &&
      parent.value === arrow &&
      !parent.computed &&
      (parent.key?.type === 'Identifier' ||
        (parent.key?.type === 'Literal' &&
          typeof parent.key.value === 'string'))
    )
      emittedDeclarations.push({ binding: parent.key, property: true, arrow })
    else if (emittedFields.has(arrow)) {
      const field = emittedFields.get(arrow)!
      emittedDeclarations.push({ binding: field.node.key, arrow, field })
    } else if (
      parent?.type === 'CallExpression' &&
      parent.arguments?.includes(arrow)
    )
      emittedDeclarations.push({
        arrow,
        callbackStart: callbackRoleStart(arrow, parent),
        callbackNext:
          parent.arguments![parent.arguments!.indexOf(arrow) + 1]?.loc.start,
      })
  })
  const used = new Set<Node>()
  return declarations.map(
    ({
      binding,
      property,
      arrow,
      callbackStart,
      callbackEnd,
      callbackNext,
      field,
    }) => {
      const candidates = emittedDeclarations.filter((value) => {
        if (
          !!binding !== !!value.binding ||
          !!property !== !!value.property ||
          !!field !== !!value.field
        )
          return false
        if (field && value.field) {
          const owner = exact(value.field.owner.id!.loc.start)
          const terminal = exact(value.field.node.loc.end)
          const body = value.arrow.body && exact(value.arrow.body.loc.start)
          if (
            !owner ||
            !same(owner, field.owner.id!.loc.start) ||
            value.field.owner.id!.name !== field.owner.id!.name ||
            value.field.node.key!.name !== field.node.key!.name ||
            value.field.node.static !== field.node.static ||
            value.arrow.body?.type !== arrow.body!.type ||
            !body ||
            !same(body, arrow.body!.loc.start) ||
            !same(value.arrow.body!.loc.end, value.arrow.loc.end) ||
            compare(value.arrow.loc.end, value.field.node.loc.end) >= 0 ||
            value.arrow.params?.some(
              (parameter) => parameter.type !== 'Identifier'
            ) ||
            !terminal ||
            !same(terminal, field.node.loc.end) ||
            value.field.node.loc.start.line !== value.arrow.loc.start.line ||
            value.arrow.loc.start.line !== value.arrow.body!.loc.end.line ||
            value.arrow.loc.start.line !== value.field.node.loc.end.line
          )
            return false
        }
        const point = exact((value.binding ?? value.arrow).loc.start)
        const role = value.callbackStart && exact(value.callbackStart)
        const next = value.callbackNext && exact(value.callbackNext)
        return (
          point &&
          same(point, (binding ?? arrow).loc.start) &&
          (!callbackStart || (role && same(role, callbackStart))) &&
          !!callbackNext === !!value.callbackNext &&
          (!callbackNext || (next && same(next, callbackNext)))
        )
      })
      if (candidates.length !== 1 || used.has(candidates[0].arrow))
        failure(arrow)
      const candidate = candidates[0].arrow
      used.add(candidate)
      const start = exact(candidate.loc.start)
      if (
        !start ||
        !same(start, arrow.loc.start) ||
        candidate.async !== arrow.async ||
        !arrow.body ||
        !candidate.body ||
        candidate.params?.length !== arrow.params?.length
      )
        failure(arrow)
      for (let index = 0; index < arrow.params!.length; index++) {
        const point = exact(candidate.params![index].loc.start)
        if (!point || !same(point, arrow.params![index].loc.start))
          failure(arrow)
      }
      const body = mappings.filter(
        (mapping) =>
          compare(generated(mapping), candidate.body!.loc.start) >= 0 &&
          compare(generated(mapping), candidate.body!.loc.end) < 0 &&
          mapping.source !== null
      )
      if (
        !body.length ||
        body.some(
          (mapping) =>
            mapping.source !== file ||
            compare(original(mapping), arrow.body!.loc.start) < 0 ||
            compare(original(mapping), arrow.body!.loc.end) >= 0
        )
      )
        failure(arrow)
      // Static calls use their final callee name; computed calls use the call's
      // opening boundary. Both that role and the arrow itself must be associated
      // through actual emitted mappings; async retains its own prefix.
      return {
        original: arrow,
        generated: candidate,
        start:
          callbackStart ?? (arrow.async ? arrow.loc.start : binding!.loc.start),
        ...(property ? { property: true as const } : {}),
        ...(field
          ? {
              classField: {
                original: field.node,
                generated: candidates[0].field!.node,
              },
            }
          : {}),
        ...(!binding ? { callback: true as const, callbackEnd } : {}),
      }
    }
  )
}

/** The coverage role map is separate from the retained stack/error source map. */
export function arrowBindingMap(
  file: string,
  sourceMap: object,
  associations: ArrowBindingAssociation[]
): object {
  if (!associations.length) return sourceMap
  const decoded = decodeCoverageMap(sourceMap)
  const map = new SourceMapGenerator()
  for (const mapping of decoded.mappings) {
    const association = associations.find((value) =>
      same(value.generated.loc.start, generated(mapping))
    )
    const point = association?.start ?? original(mapping)
    const position = { generated: generated(mapping) }
    if (mapping.source === null) {
      ;(map.addMapping as (mapping: typeof position) => void)(position)
    } else {
      if (association && mapping.source !== file)
        throw new Error('Arrow binding map crosses its original source')
      map.addMapping({ ...position, source: mapping.source, original: point })
    }
  }
  for (const [source, content] of decoded.sources)
    if (content !== null) map.setSourceContent(source, content)
  return JSON.parse(map.toString())
}

/** Change descriptors only after preserving all actual V8 counter identities. */
export function bindOriginalArrowLocations(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  associations: ArrowBindingAssociation[]
): void {
  const targetModel = model,
    targetObserved = observed,
    staged = associations.some((association) => association.classField)
  if (staged) {
    model = structuredClone(model)
    observed = structuredClone(observed)
  }
  const usedFunctions = new Set<string>(),
    usedStatements = new Set<string>(),
    usedObservedFunctions = new Set<string>()
  for (const association of associations) {
    const start = association.original.loc.start
    const functions = Object.entries(model.fnMap).filter(([, fn]) =>
      same(fn.decl.start as Point, start)
    )
    const ownsStatement = !association.callback && !association.property
    const statements = ownsStatement
      ? Object.entries(model.statementMap).filter(([, location]) =>
          same(location.start as Point, start)
        )
      : []
    const actual = Object.entries(observed.fnMap).filter(([, fn]) =>
      same(fn.decl.start as Point, association.start)
    )
    if (
      functions.length !== 1 ||
      (ownsStatement && statements.length !== 1) ||
      actual.length !== 1 ||
      usedFunctions.has(functions[0][0]) ||
      (ownsStatement && usedStatements.has(statements[0][0])) ||
      usedObservedFunctions.has(actual[0][0]) ||
      actual[0][1].loc.end.line !== functions[0][1].loc.end.line
    )
      throw new Error(
        `Standard coverage arrow binding association is ambiguous or absent: ${file}:${start.line}:${start.column}`
      )
    usedFunctions.add(functions[0][0])
    if (ownsStatement) usedStatements.add(statements[0][0])
    usedObservedFunctions.add(actual[0][0])
    functions[0][1].decl.start = association.start
    // Callback descriptors retain the uniquely matched authored prefix and
    // call argument boundary. Variable and property bindings keep the actual
    // mapped endpoint, including the next binding on a line. Only variable
    // initializers own a separate statement. Observed counters never change.
    if (association.callback) {
      if (!association.original.async)
        actual[0][1].decl.end = functions[0][1].decl.end
      functions[0][1].loc.end = association.callbackEnd!
      actual[0][1].loc.end = association.callbackEnd!
      if (association.original.body!.type !== 'BlockStatement') {
        const body = association.original.body!.loc
        const originalStatements = Object.entries(model.statementMap).filter(
          ([, location]) => same(location.start as Point, body.start)
        )
        const observedStatements = Object.entries(observed.statementMap).filter(
          ([, location]) => same(location.start as Point, body.start)
        )
        if (
          originalStatements.length !== 1 ||
          observedStatements.length !== 1 ||
          observedStatements[0][1].end.line !== body.end.line
        )
          throw new Error(
            `Standard coverage callback body association is ambiguous or absent: ${file}:${body.start.line}:${body.start.column}`
          )
        observedStatements[0][1].end = association.callbackEnd!
      }
    } else functions[0][1].loc.end = actual[0][1].loc.end
    if (ownsStatement) statements[0][1].start = association.start
    if (association.classField) {
      const terminal = association.classField.original.loc.end
      const body = association.original.body!
      const initializer = Object.values(observed.statementMap).filter(
        (location) => same(location.start, association.start)
      )
      const modelBody = Object.values(model.statementMap).filter((location) =>
        same(location.start, body.loc.start)
      )
      const actualBody = Object.values(observed.statementMap).filter(
        (location) => same(location.start, body.loc.start)
      )
      if (
        initializer.length !== 1 ||
        modelBody.length !== 1 ||
        actualBody.length !== 1 ||
        !same(initializer[0].end, terminal) ||
        !same(actual[0][1].loc.end, terminal) ||
        !same(actualBody[0].end, terminal) ||
        !same(statements[0][1].end, association.original.loc.end) ||
        !same(modelBody[0].end, body.loc.end)
      )
        throw new Error(
          `Standard coverage class arrow endpoint is ambiguous or absent: ${file}:${start.line}:${start.column}`
        )
      // The actual field terminal closes the initializer and expression body.
      // This qualified same-line role retains the converter's unbounded end.
      for (const location of [
        statements[0][1],
        initializer[0],
        modelBody[0],
        actualBody[0],
        functions[0][1].loc,
        actual[0][1].loc,
      ])
        location.end = { line: terminal.line, column: Infinity }
    }
  }
  if (staged) {
    Object.assign(targetModel, model)
    Object.assign(targetObserved, observed)
  }
}

/** Retain an emitted callback's qualified following-argument endpoint. */
export function bindFunctionExpressionCallbackEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown
): void {
  const mappings = decodeCoverageMap(sourceMap).mappings
  const exact = (point: Point, expected: Point) => {
    const values = mappings.filter((mapping) => same(generated(mapping), point))
    return (
      values.length > 0 &&
      values.every(
        (mapping) =>
          mapping.source === file && same(original(mapping), expected)
      )
    )
  }
  type Callback = { fn: Node; next: Node }
  const callbacks = (ast: unknown): Callback[] => {
    const result: Callback[] = []
    walk(ast, (fn, parent) => {
      if (
        fn.type !== 'FunctionExpression' ||
        fn.generator ||
        parent?.type !== 'CallExpression'
      )
        return
      const index = parent.arguments?.indexOf(fn) ?? -1
      const next = index >= 0 ? parent.arguments?.[index + 1] : undefined
      if (next) result.push({ fn, next })
    })
    return result
  }
  const generatedCallbacks = callbacks(emitted)
  const used = new Set<Node>()
  const usedFunctions = new Set<string>()
  const usedObservedFunctions = new Set<string>()
  const failure = (fn: Node): never => {
    throw new Error(
      `Standard coverage function callback boundary is ambiguous or absent: ${file}:${fn.loc.start.line}:${fn.loc.start.column}`
    )
  }
  for (const { fn, next } of callbacks(authored)) {
    const candidates = generatedCallbacks.filter(
      (candidate) =>
        exact(candidate.fn.loc.start, fn.loc.start) &&
        exact(candidate.next.loc.start, next.loc.start)
    )
    if (candidates.length !== 1 || used.has(candidates[0].fn)) failure(fn)
    const candidate = candidates[0].fn
    used.add(candidate)
    if (
      candidate.async !== fn.async ||
      !!candidate.id !== !!fn.id ||
      (fn.id && !exact(candidate.id!.loc.start, fn.id.loc.start)) ||
      candidate.params?.length !== fn.params?.length ||
      !candidate.body ||
      !fn.body
    )
      failure(fn)
    for (let index = 0; index < fn.params!.length; index++) {
      if (
        !exact(candidate.params![index].loc.start, fn.params![index].loc.start)
      )
        failure(fn)
    }
    const body = mappings.filter(
      (mapping) =>
        compare(generated(mapping), candidate.body!.loc.start) >= 0 &&
        compare(generated(mapping), candidate.body!.loc.end) < 0 &&
        mapping.source !== null
    )
    if (
      !body.length ||
      body.some(
        (mapping) =>
          mapping.source !== file ||
          compare(original(mapping), fn.body!.loc.start) < 0 ||
          compare(original(mapping), fn.body!.loc.end) >= 0
      )
    )
      failure(fn)
    // SWC can omit the brace mapping. The converter then uses the last
    // segment on that generated line, commonly the closing parameter token.
    const starts = mappings.filter(
      (mapping) =>
        mapping.generatedLine === candidate.body!.loc.start.line &&
        mapping.generatedColumn <= candidate.body!.loc.start.column
    )
    const column = starts.reduce(
      (last, mapping) => Math.max(last, mapping.generatedColumn),
      -1
    )
    const boundary = starts.filter(
      (mapping) => mapping.generatedColumn === column
    )
    if (!boundary.length || boundary.some((mapping) => mapping.source !== file))
      failure(fn)
    const mappedStart = original(boundary[0])
    if (
      boundary.some((mapping) => !same(original(mapping), mappedStart)) ||
      compare(mappedStart, fn.loc.start) < 0 ||
      compare(mappedStart, fn.body!.loc.start) > 0
    )
      failure(fn)
    const start = fn.id?.loc.start ?? fn.loc.start
    const functions = Object.entries(model.fnMap).filter(([, value]) =>
      same(value.decl.start as Point, start)
    )
    const actual = Object.entries(observed.fnMap).filter(([, value]) =>
      same(value.decl.start as Point, start)
    )
    if (
      functions.length !== 1 ||
      actual.length !== 1 ||
      usedFunctions.has(functions[0][0]) ||
      usedObservedFunctions.has(actual[0][0]) ||
      !same(functions[0][1].loc.start as Point, fn.body!.loc.start) ||
      !same(actual[0][1].loc.start as Point, mappedStart) ||
      !same(actual[0][1].loc.end as Point, next.loc.start)
    )
      failure(fn)
    usedFunctions.add(functions[0][0])
    usedObservedFunctions.add(actual[0][0])
    // The actual converted descriptor already carries this call boundary.
    // Preserve it in the authored model without changing any observed facts.
    functions[0][1].loc.end = { ...actual[0][1].loc.end }
  }
}

/** Retain the unbounded endpoint of a uniquely mapped typed class initializer. */
export function bindClassFunctionExpressionEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown
): void {
  if (!/\.[cm]?ts$/.test(file) || /\.d\.[cm]?ts$/.test(file)) return
  type Field = { owner: Node; field: Node; fn: Node }
  const fields = (ast: unknown): Field[] => {
    const result: Field[] = []
    walk(ast, (owner) => {
      if (
        owner.type !== 'ClassDeclaration' ||
        owner.id?.type !== 'Identifier' ||
        owner.body?.type !== 'ClassBody' ||
        !Array.isArray(owner.body.body)
      )
        return
      for (const field of owner.body.body as Node[]) {
        const fn = field.value as Node | undefined
        if (
          ['ClassProperty', 'PropertyDefinition'].includes(field.type) &&
          !field.computed &&
          !field.declare &&
          field.key?.type === 'Identifier' &&
          fn?.type === 'FunctionExpression'
        )
          result.push({ owner, field, fn })
      }
    })
    return result
  }
  const returns = (fn: Node): Node[] =>
    fn.body?.type === 'BlockStatement' && Array.isArray(fn.body.body)
      ? (fn.body.body as Node[])
      : []
  const selected = fields(authored).filter(({ field, fn }) => {
    const statements = returns(fn)
    return (
      !fn.id &&
      !fn.async &&
      !fn.generator &&
      fn.params?.length === 1 &&
      fn.params[0].type === 'Identifier' &&
      fn.params[0].typeAnnotation?.type === 'TSTypeAnnotation' &&
      statements.length === 1 &&
      statements[0].type === 'ReturnStatement' &&
      statements[0].argument?.type === 'BinaryExpression' &&
      field.loc.start.line === fn.loc.start.line &&
      fn.loc.start.line === fn.loc.end.line &&
      fn.loc.end.line === field.loc.end.line
    )
  })
  if (!selected.length) return
  const mappings = decodeCoverageMap(sourceMap).mappings
  const exact = (point: Point, expected: Point) => {
    const values = mappings.filter((mapping) => same(generated(mapping), point))
    return (
      values.length > 0 &&
      values.every(
        (mapping) =>
          mapping.source === file && same(original(mapping), expected)
      )
    )
  }
  const candidates = fields(emitted)
  const stagedModel = structuredClone(model)
  const stagedObserved = structuredClone(observed)
  const used = new Set<Node>()
  const usedModel = new Set<string>()
  const usedObserved = new Set<string>()
  const failure = (fn: Node): never => {
    throw new Error(
      `Standard coverage class function endpoint is ambiguous or absent: ${file}:${fn.loc.start.line}:${fn.loc.start.column}`
    )
  }
  for (const { owner, field, fn } of selected) {
    const matches = candidates.filter(
      (candidate) =>
        candidate.owner.id!.name === owner.id!.name &&
        candidate.field.key!.name === field.key!.name &&
        candidate.field.static === field.static &&
        exact(candidate.owner.id!.loc.start, owner.id!.loc.start) &&
        exact(candidate.field.key!.loc.start, field.key!.loc.start) &&
        exact(candidate.fn.loc.start, fn.loc.start)
    )
    if (matches.length !== 1 || used.has(matches[0].fn)) failure(fn)
    const candidate = matches[0]
    used.add(candidate.fn)
    const statements = returns(fn)
    const emittedStatements = returns(candidate.fn)
    if (
      candidate.fn.id ||
      candidate.fn.async ||
      candidate.fn.generator ||
      candidate.fn.params?.length !== 1 ||
      candidate.fn.params[0].type !== 'Identifier' ||
      emittedStatements.length !== 1 ||
      emittedStatements[0].type !== 'ReturnStatement' ||
      emittedStatements[0].argument?.type !== 'BinaryExpression' ||
      emittedStatements[0].argument.operator !==
        statements[0].argument!.operator ||
      !exact(candidate.fn.params[0].loc.start, fn.params![0].loc.start) ||
      !exact(emittedStatements[0].loc.start, statements[0].loc.start) ||
      !exact(
        emittedStatements[0].argument.loc.start,
        statements[0].argument!.loc.start
      ) ||
      !exact(candidate.field.loc.end, field.loc.end) ||
      !same(fn.loc.end, fn.body!.loc.end) ||
      !same(candidate.fn.loc.end, candidate.fn.body!.loc.end) ||
      compare(fn.loc.end, field.loc.end) >= 0 ||
      compare(candidate.fn.loc.end, candidate.field.loc.end) >= 0
    )
      failure(fn)
    const body = mappings.filter(
      (mapping) =>
        compare(generated(mapping), candidate.fn.body!.loc.start) >= 0 &&
        compare(generated(mapping), candidate.fn.body!.loc.end) < 0 &&
        mapping.source !== null
    )
    if (
      !body.length ||
      body.some(
        (mapping) =>
          mapping.source !== file ||
          compare(original(mapping), fn.body!.loc.start) < 0 ||
          compare(original(mapping), fn.body!.loc.end) >= 0
      )
    )
      failure(fn)
    const preceding = mappings.filter(
      (mapping) =>
        mapping.generatedLine === candidate.fn.body!.loc.start.line &&
        mapping.generatedColumn <= candidate.fn.body!.loc.start.column
    )
    const column = preceding.reduce(
      (last, mapping) => Math.max(last, mapping.generatedColumn),
      -1
    )
    const boundary = preceding.filter(
      (mapping) => mapping.generatedColumn === column
    )
    if (!boundary.length || boundary.some((mapping) => mapping.source !== file))
      failure(fn)
    const bodyStart = original(boundary[0])
    if (
      boundary.some((mapping) => !same(original(mapping), bodyStart)) ||
      compare(bodyStart, fn.loc.start) < 0 ||
      compare(bodyStart, fn.body!.loc.start) > 0
    )
      failure(fn)
    const functions = Object.entries(stagedModel.fnMap).filter(([, value]) =>
      same(value.decl.start, fn.loc.start)
    )
    const actual = Object.entries(stagedObserved.fnMap).filter(([, value]) =>
      same(value.decl.start, fn.loc.start)
    )
    const initializers = [stagedModel, stagedObserved].map((data) =>
      Object.values(data.statementMap).filter((location) =>
        same(location.start, fn.loc.start)
      )
    )
    if (
      functions.length !== 1 ||
      actual.length !== 1 ||
      usedModel.has(functions[0][0]) ||
      usedObserved.has(actual[0][0]) ||
      initializers.some((values) => values.length !== 1) ||
      !same(functions[0][1].loc.start, fn.body!.loc.start) ||
      !same(functions[0][1].loc.end, fn.body!.loc.end) ||
      !same(actual[0][1].loc.start, bodyStart) ||
      !same(actual[0][1].loc.end, field.loc.end) ||
      !same(initializers[0][0].end, fn.loc.end) ||
      !same(initializers[1][0].end, field.loc.end)
    )
      failure(fn)
    usedModel.add(functions[0][0])
    usedObserved.add(actual[0][0])
    for (const location of [
      functions[0][1].loc,
      actual[0][1].loc,
      initializers[0][0],
      initializers[1][0],
    ])
      location.end = { line: field.loc.end.line, column: Infinity }
  }
  Object.assign(model, stagedModel)
  Object.assign(observed, stagedObserved)
}

/** Empty parameter lists end the named declaration role at its associated body. */
export function bindEmptyParameterDeclarationEnds(
  file: string,
  model: StandardCoverageData,
  observed: StandardCoverageData,
  authored: unknown,
  emitted: unknown,
  sourceMap: unknown
): void {
  const mappings = decodeCoverageMap(sourceMap).mappings
  const exact = (point: Point, expected: Point) => {
    const values = mappings.filter((mapping) => same(generated(mapping), point))
    return (
      values.length > 0 &&
      values.every(
        (mapping) =>
          mapping.source === file && same(original(mapping), expected)
      )
    )
  }
  const declarations: Node[] = []
  walk(emitted, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id && !node.params?.length)
      declarations.push(node)
  })
  const used = new Set<Node>()
  walk(authored, (node) => {
    if (
      node.type !== 'FunctionDeclaration' ||
      !node.id ||
      node.params?.length ||
      !node.body
    )
      return
    const candidates = declarations.filter(
      (candidate) =>
        candidate.body &&
        candidate.async === node.async &&
        exact(candidate.loc.start, node.loc.start) &&
        exact(candidate.id!.loc.start, node.id!.loc.start)
    )
    const functions = [model, observed].map((data) =>
      Object.values(data.fnMap).filter((fn) =>
        same(fn.decl.start as Point, node.id!.loc.start)
      )
    )
    const candidate = candidates[0]
    const body =
      candidate &&
      mappings.filter(
        (mapping) =>
          compare(generated(mapping), candidate.body!.loc.start) >= 0 &&
          compare(generated(mapping), candidate.body!.loc.end) < 0 &&
          mapping.source !== null
      )
    if (
      candidates.length !== 1 ||
      used.has(candidate) ||
      functions.some((matches) => matches.length !== 1) ||
      !body?.length ||
      body.some(
        (mapping) =>
          mapping.source !== file ||
          compare(original(mapping), node.body!.loc.start) < 0 ||
          compare(original(mapping), node.body!.loc.end) >= 0
      )
    )
      throw new Error(
        `Standard coverage empty-parameter declaration association is ambiguous or absent: ${file}:${node.id.loc.start.line}:${node.id.loc.start.column}`
      )
    used.add(candidate)
    // SWC may omit a mapping for the opening brace. Its uniquely linked AST body
    // supplies that display boundary without changing any observed V8 counts.
    for (const [fn] of functions) fn.decl.end = node.body.loc.start
  })
}
