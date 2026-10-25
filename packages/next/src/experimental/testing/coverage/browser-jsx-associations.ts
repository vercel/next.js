import { SourceMapGenerator } from 'next/dist/compiled/source-map'
import type {
  BrowserAutomaticFactory,
  BrowserClassicFactory,
} from './browser-imports'
import { decodeCoverageMap } from './maps'

type Point = { line: number; column: number }
type Node = {
  type: string
  start: number
  end: number
  loc: { start: Point; end: Point }
  [key: string]: any
}
const same = (a: Point | undefined, b: Point | undefined) =>
  !!a && !!b && a.line === b.line && a.column === b.column
const before = (a: Point, b: Point) =>
  a.line < b.line || (a.line === b.line && a.column < b.column)

function nodes(ast: unknown): { node: Node; parents: Node[] }[] {
  const result: { node: Node; parents: Node[] }[] = []
  function visit(value: any, parents: Node[]): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value))
      return value.forEach((child) => visit(child, parents))
    const next = typeof value.type === 'string' ? [...parents, value] : parents
    if (typeof value.type === 'string') result.push({ node: value, parents })
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child, next)
  }
  visit(ast, [])
  return result
}

export const browserJsxChildKey = (node: {
  type: string
  loc: { start: Point }
}) => `${node.type}:${node.loc.start.line}:${node.loc.start.column}`

/** Conversion-only JSX ownership; the native artifact and its stack map stay intact. */
export function associateBrowserJsxCalls(options: {
  file: string
  code: string
  authored: unknown
  emitted: unknown
  sourceMap: unknown
  classic?: readonly BrowserClassicFactory[]
  automatic?: readonly BrowserAutomaticFactory[]
}): { sourceMap: object; children: ReadonlySet<string> } | undefined {
  const classic = options.classic ?? []
  const automatic = options.automatic ?? []
  if (!classic.length && !automatic.length) return
  const fail = (): never => {
    throw new Error(
      `Standard coverage Browser JSX call association is ambiguous or absent: ${options.file}`
    )
  }
  if (classic.length + automatic.length !== 1) fail()
  const factory = classic[0] ?? automatic[0]
  if (
    !factory.binding ||
    !Number.isSafeInteger(factory.moduleStart) ||
    !Number.isSafeInteger(factory.moduleEnd) ||
    factory.moduleStart < 0 ||
    factory.moduleEnd <= factory.moduleStart ||
    factory.moduleEnd > options.code.length
  )
    fail()
  const decoded = decodeCoverageMap(options.sourceMap)
  const source = decoded.sources.get(options.file)
  if (typeof source !== 'string') fail()
  const pragma = classic[0]?.namedPragma
  if (pragma) {
    const comments = (options.authored as Node).comments ?? []
    const matches = (
      name: string,
      value: { local: string; start: Point; end: Point }
    ) => {
      const found = comments.filter((comment: Node) =>
        new RegExp('@' + name + '\\b').test(comment.value)
      )
      return (
        found.length === 1 &&
        found[0].type === 'CommentBlock' &&
        found[0].value.trim() === '* @' + name + ' ' + value.local &&
        same(found[0].loc.start, value.start) &&
        same(found[0].loc.end, value.end)
      )
    }
    if (
      !matches('jsx', pragma) ||
      (pragma.fragment && !matches('jsxFrag', pragma.fragment))
    )
      return
  }
  const originals = nodes(options.authored),
    generated = nodes(options.emitted)
  type Binding = {
    node: Node
    id: Node
    value: Node
    kind:
      | 'function'
      | 'arrow'
      | 'object'
      | 'expression'
      | 'class'
      | 'class-expression'
  }
  function moduleBindings(rows: ReturnType<typeof nodes>, emitted: boolean) {
    const result = new Map<string, Binding[]>()
    for (const { node, parents } of rows) {
      if (
        emitted &&
        (node.start < factory.moduleStart || node.end > factory.moduleEnd)
      )
        continue
      const parent = [...parents]
        .reverse()
        .find(
          (value) =>
            !['ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(
              value.type
            )
        )
      if (
        !parent ||
        (emitted
          ? parent.type !== 'Program' &&
            !(
              parent.type === 'BlockStatement' &&
              parent.start < factory.moduleStart &&
              parent.end >= factory.moduleEnd
            )
          : parent.type !== 'Program')
      )
        continue
      const add = (id: Node, value: Node, kind: Binding['kind']) => {
        if (id?.type !== 'Identifier') return
        const existing = result.get(id.name) ?? []
        existing.push({ node, id, value, kind })
        result.set(id.name, existing)
      }
      if (node.type === 'FunctionDeclaration' && node.id)
        add(node.id, node, 'function')
      if (node.type === 'ClassDeclaration' && node.id)
        add(node.id, node, 'class')
      if (node.type === 'VariableDeclaration' && node.kind === 'const')
        for (const declaration of node.declarations) {
          if (declaration.init?.type === 'ArrowFunctionExpression')
            add(declaration.id, declaration.init, 'arrow')
          if (declaration.init?.type === 'ObjectExpression')
            add(declaration.id, declaration.init, 'object')
          if (declaration.init?.type === 'FunctionExpression')
            add(declaration.id, declaration.init, 'expression')
          if (declaration.init?.type === 'ClassExpression')
            add(declaration.id, declaration.init, 'class-expression')
        }
    }
    return result
  }
  const sourceBindings = moduleBindings(originals, false),
    emittedBindings = moduleBindings(generated, true),
    bindingPairs = new Map<
      string,
      { source: Binding; actual: Binding } | undefined
    >()
  const exact = (at: Point, original: Point) => {
    const found = decoded.mappings.filter((mapping) =>
      same({ line: mapping.generatedLine, column: mapping.generatedColumn }, at)
    )
    return (
      found.length > 0 &&
      found.every(
        (mapping) =>
          mapping.source === options.file &&
          same(
            { line: mapping.originalLine!, column: mapping.originalColumn! },
            original
          )
      )
    )
  }
  const isJsx = (node: Node | undefined) =>
    !!node && ['JSXElement', 'JSXFragment'].includes(node.type)
  function children(owner: Node): Node[] | undefined {
    const result: Node[] = []
    for (const child of owner.children) {
      if (child.type === 'JSXText') {
        if (/\r|\n/.test(child.value)) {
          if (!/^\s*$/.test(child.value)) return
          continue
        }
        if (!child.value) continue
      }
      if (child.type === 'JSXExpressionContainer') {
        if (child.expression.type === 'JSXEmptyExpression') return
        result.push(child.expression)
      } else result.push(child)
    }
    return result
  }
  function supportedExpression(node: Node): boolean {
    if (isJsx(node)) return supported(node)
    if (node.type === 'Identifier' || node.type === 'Literal') return true
    if (node.type === 'MemberExpression')
      return (
        !!pragma &&
        !node.computed &&
        !node.optional &&
        node.property?.type === 'Identifier' &&
        (node.object?.type === 'ThisExpression' ||
          (['Identifier', 'MemberExpression'].includes(node.object?.type) &&
            supportedExpression(node.object)))
      )
    if (node.type === 'JSXText') return !/\r|\n/.test(node.value)
    if (node.type === 'LogicalExpression')
      return (
        node.operator === '&&' &&
        supportedExpression(node.left) &&
        supportedExpression(node.right)
      )
    if (node.type === 'ConditionalExpression')
      return (
        supportedExpression(node.test) &&
        supportedExpression(node.consequent) &&
        supportedExpression(node.alternate)
      )
    return false
  }
  function creatorBinding(originalBinding: Binding, actual: Binding): boolean {
    if (
      !['expression', 'class', 'class-expression'].includes(
        originalBinding.kind
      )
    )
      return true
    const originalValue = originalBinding.value,
      after = actual.value
    if (
      originalValue.type !== after.type ||
      !exact(after.loc.start, originalValue.loc.start) ||
      !!originalValue.id !== !!after.id ||
      (originalValue.id &&
        (originalValue.id.type !== 'Identifier' ||
          after.id.type !== 'Identifier' ||
          originalValue.id.name !== after.id.name ||
          !exact(after.id.loc.start, originalValue.id.loc.start))) ||
      originalValue.decorators?.length ||
      after.decorators?.length
    )
      return false
    if (originalBinding.kind === 'expression')
      return (
        !originalValue.async &&
        !originalValue.generator &&
        !after.async &&
        !after.generator
      )
    if (
      originalValue.body?.type !== 'ClassBody' ||
      after.body?.type !== 'ClassBody' ||
      !!originalValue.superClass !== !!after.superClass ||
      originalValue.body.body.length !== after.body.body.length
    )
      return false
    return originalValue.body.body.every((method: Node, index: number) => {
      const emitted = after.body.body[index]
      return (
        method.type === 'MethodDefinition' &&
        emitted.type === 'MethodDefinition' &&
        method.kind === 'method' &&
        emitted.kind === 'method' &&
        !method.computed &&
        !emitted.computed &&
        method.key?.type === 'Identifier' &&
        emitted.key?.type === 'Identifier' &&
        method.key.name === emitted.key.name &&
        !!method.static === !!emitted.static &&
        method.value?.type === 'FunctionExpression' &&
        emitted.value?.type === 'FunctionExpression' &&
        method.value.body?.type === 'BlockStatement' &&
        emitted.value.body?.type === 'BlockStatement' &&
        !method.value.async &&
        !method.value.generator &&
        !emitted.value.async &&
        !emitted.value.generator &&
        exact(emitted.key.loc.start, method.key.loc.start) &&
        exact(emitted.value.body.loc.start, method.value.body.loc.start)
      )
    })
  }
  function bindingPair(name: string) {
    if (bindingPairs.has(name)) return bindingPairs.get(name)
    const authoredBindings = sourceBindings.get(name),
      actual = emittedBindings.get(name)
    let pair: { source: Binding; actual: Binding } | undefined
    if (
      authoredBindings?.length === 1 &&
      actual?.length === 1 &&
      authoredBindings[0].kind === actual[0].kind &&
      exact(actual[0].id.loc.start, authoredBindings[0].id.loc.start) &&
      creatorBinding(authoredBindings[0], actual[0]) &&
      (authoredBindings[0].kind === 'object' ||
        (!!authoredBindings[0].value.async === !!actual[0].value.async &&
          !!authoredBindings[0].value.generator ===
            !!actual[0].value.generator))
    )
      pair = { source: authoredBindings[0], actual: actual[0] }
    bindingPairs.set(name, pair)
    return pair
  }
  function tagPath(
    tag: Node
  ): { root: string; properties: string[] } | undefined {
    if (
      tag?.type === 'JSXIdentifier' &&
      tag.name !== 'this' &&
      !tag.name.includes('-')
    )
      return { root: tag.name, properties: [] }
    if (
      tag?.type !== 'JSXMemberExpression' ||
      tag.property?.type !== 'JSXIdentifier' ||
      tag.property.name.includes('-')
    )
      return
    const base = tagPath(tag.object)
    return (
      base && {
        root: base.root,
        properties: [...base.properties, tag.property.name],
      }
    )
  }
  function staticProperties(value: Node) {
    if (value.type !== 'ObjectExpression') return
    const result = new Map<string, Node>()
    for (const property of value.properties) {
      if (
        property.type !== 'Property' ||
        property.computed ||
        property.method ||
        property.kind !== 'init'
      )
        return
      const name =
        property.key?.type === 'Identifier'
          ? property.key.name
          : property.key?.type === 'Literal' &&
              typeof property.key.value === 'string'
            ? property.key.value
            : undefined
      if (name === undefined || result.has(name)) return
      result.set(name, property)
    }
    return result
  }
  function component(tag: Node) {
    const path = tagPath(tag)
    if (!path || (!path.properties.length && /^[a-z]/.test(path.root))) return
    const root = bindingPair(path.root)
    if (!root) return
    let pair = root
    for (const name of path.properties) {
      if (pair.source.kind !== 'object') return
      const authoredProperties = staticProperties(pair.source.value),
        actual = staticProperties(pair.actual.value)
      if (
        !authoredProperties ||
        !actual ||
        authoredProperties.size !== actual.size ||
        [...authoredProperties.keys()].some((key) => !actual.has(key))
      )
        return
      const original = authoredProperties.get(name),
        emitted = actual.get(name)
      if (
        !original ||
        !emitted ||
        !exact(emitted.key.loc.start, original.key.loc.start)
      )
        return
      if (
        original.value.type !== 'Identifier' ||
        emitted.value.type !== 'Identifier' ||
        original.value.name !== emitted.value.name ||
        !exact(emitted.value.loc.start, original.value.loc.start)
      )
        return
      const next = bindingPair(original.value.name)
      if (!next) return
      pair = next
    }
    return pair.source.kind !== 'object' ? root : undefined
  }
  function sameTagName(a: Node, b: Node): boolean {
    if (a?.type !== b?.type) return false
    if (a?.type === 'JSXIdentifier') return a.name === b.name
    return (
      a?.type === 'JSXMemberExpression' &&
      sameTagName(a.object, b.object) &&
      sameTagName(a.property, b.property)
    )
  }
  function tagValue(original: Node, actual: Node): boolean {
    if (!actual || !exact(actual.loc.start, original.loc.start)) return false
    if (original.type === 'JSXIdentifier')
      return actual.type === 'Identifier' && actual.name === original.name
    return (
      original.type === 'JSXMemberExpression' &&
      actual.type === 'MemberExpression' &&
      !actual.computed &&
      !actual.optional &&
      actual.property?.type === 'Identifier' &&
      actual.property.name === original.property.name &&
      exact(actual.property.loc.start, original.property.loc.start) &&
      tagValue(original.object, actual.object)
    )
  }
  function supported(owner: Node): boolean {
    const selfClosing =
      owner.type === 'JSXElement' && owner.openingElement?.selfClosing === true
    if (selfClosing) {
      if (
        owner.closingElement ||
        owner.closingFragment ||
        owner.children.length ||
        !same(owner.openingElement.loc.end, owner.loc.end) ||
        source!.slice(owner.end - 2, owner.end) !== '/>'
      )
        return false
    } else if (!(owner.closingElement ?? owner.closingFragment)) return false
    if (owner.type === 'JSXFragment' && pragma && !pragma.fragment) return false
    const tag = owner.openingElement?.name
    if (
      owner.type === 'JSXElement' &&
      ((!(
        tag?.type === 'JSXIdentifier' && /^[a-z][a-z0-9-]*$/.test(tag.name)
      ) &&
        !component(tag)) ||
        owner.openingElement.attributes.some(
          (attribute: Node) =>
            attribute.type !== 'JSXAttribute' ||
            attribute.name?.type !== 'JSXIdentifier' ||
            attribute.name.name === 'children' ||
            (attribute.value !== null &&
              (!attribute.value ||
                !supportedExpression(
                  attribute.value.type === 'JSXExpressionContainer'
                    ? attribute.value.expression
                    : attribute.value
                )))
        ))
    )
      return false
    const values = children(owner)
    return !!values && values.every(supportedExpression)
  }
  function member(node: Node | undefined, property: string): boolean {
    return (
      node?.type === 'MemberExpression' &&
      node.computed === true &&
      !node.optional &&
      node.object?.type === 'Identifier' &&
      node.object.name === factory.binding &&
      node.property?.type === 'Literal' &&
      node.property.value === property
    )
  }
  function ownedCall(call: Node, count: number): boolean {
    if (
      call.type !== 'CallExpression' ||
      call.optional ||
      !Number.isSafeInteger(call.start) ||
      !Number.isSafeInteger(call.end) ||
      call.start < factory.moduleStart ||
      call.end > factory.moduleEnd
    )
      return false
    if (pragma) {
      const callee = call.callee
      return (
        callee?.type === 'SequenceExpression' &&
        callee.expressions.length === 2 &&
        callee.expressions[0].type === 'Literal' &&
        callee.expressions[0].value === 0 &&
        member(callee.expressions[1], 'createElement')
      )
    }
    if (classic.length)
      return (
        call.callee?.type === 'MemberExpression' &&
        !call.callee.computed &&
        !call.callee.optional &&
        call.callee.property?.type === 'Identifier' &&
        call.callee.property.name === 'createElement' &&
        member(call.callee.object, 'default')
      )
    const name = count > 1 ? 'jsxs' : 'jsx',
      callee = call.callee
    return (
      automatic[0].imports.includes(name) &&
      callee?.type === 'SequenceExpression' &&
      callee.expressions.length === 2 &&
      callee.expressions[0].type === 'Literal' &&
      callee.expressions[0].value === 0 &&
      member(callee.expressions[1], name)
    )
  }
  function fragment(node: Node): boolean {
    if (automatic.length)
      return (
        automatic[0].imports.includes('Fragment') && member(node, 'Fragment')
      )
    if (pragma) return !!pragma.fragment && member(node, 'Fragment')
    return (
      node?.type === 'MemberExpression' &&
      !node.computed &&
      !node.optional &&
      node.property?.type === 'Identifier' &&
      node.property.name === 'Fragment' &&
      member(node.object, 'default')
    )
  }
  function binds(node: Node | undefined, name = factory.binding): boolean {
    if (!node) return false
    if (node.type === 'Identifier') return node.name === name
    if (node.type === 'AssignmentPattern') return binds(node.left, name)
    if (node.type === 'RestElement') return binds(node.argument, name)
    if (node.type === 'ArrayPattern')
      return node.elements.some((value: Node) => binds(value, name))
    if (node.type === 'ObjectPattern')
      return node.properties.some((property: Node) =>
        binds(
          property.type === 'RestElement' ? property.argument : property.value,
          name
        )
      )
    return false
  }
  function shadowed(
    parents: Node[],
    name: string,
    start: number,
    binding?: Node
  ): boolean {
    return parents.some(
      (scope) =>
        scope.start >= start &&
        (([
          'FunctionDeclaration',
          'FunctionExpression',
          'ArrowFunctionExpression',
        ].includes(scope.type) &&
          ((scope !== binding && binds(scope.id, name)) ||
            scope.params.some((value: Node) => binds(value, name)))) ||
          (scope.type === 'BlockStatement' &&
            scope.body.some(
              (statement: Node) =>
                (statement.type === 'VariableDeclaration' &&
                  statement.declarations.some((value: Node) =>
                    binds(value.id, name)
                  )) ||
                (['ClassDeclaration', 'FunctionDeclaration'].includes(
                  statement.type
                ) &&
                  statement !== binding &&
                  binds(statement.id, name))
            )))
    )
  }
  const used = new Set<Node>(),
    terminals: { generated: Point; original: Point }[] = [],
    ownedChildren = new Set<string>(),
    replacements = new Map<object, Point>()
  function associate(owner: Node): Node {
    const values = children(owner)!,
      tag = owner.openingElement?.name
    const candidates = generated.filter(
      ({ node }) =>
        ownedCall(node, values.length) &&
        exact(node.loc.start, owner.loc.start) &&
        (owner.type === 'JSXFragment'
          ? fragment(node.arguments[0])
          : component(tag)
            ? tagValue(tag, node.arguments[0])
            : node.arguments[0]?.type === 'Literal' &&
              node.arguments[0].value === tag.name &&
              exact(node.arguments[0].loc.start, tag.loc.start))
    )
    if (candidates.length !== 1 || used.has(candidates[0].node)) fail()
    const { node: call, parents } = candidates[0]
    if (pragma) {
      const ownRole = (
        node: Node,
        first: Point,
        span: { start: Point; end: Point }
      ) => {
        const mappings = decoded.mappings.filter((mapping) => {
          const at = {
            line: mapping.generatedLine,
            column: mapping.generatedColumn,
          }
          return !before(at, node.loc.start) && !before(node.loc.end, at)
        })
        if (mappings.length !== 2) fail()
        for (const [index, mapping] of mappings.entries()) {
          if (
            mapping.source !== options.file ||
            !same(
              { line: mapping.generatedLine, column: mapping.generatedColumn },
              index === 0 ? first : node.loc.end
            ) ||
            !same(
              { line: mapping.originalLine!, column: mapping.originalColumn! },
              index === 0 ? span.start : span.end
            ) ||
            replacements.has(mapping)
          )
            fail()
          replacements.set(mapping, { ...owner.loc.start })
        }
      }
      ownRole(call.callee, call.callee.expressions[1].loc.start, pragma)
      if (owner.type === 'JSXFragment')
        ownRole(
          call.arguments[0],
          call.arguments[0].loc.start,
          pragma.fragment!
        )
    }
    if (shadowed(parents, factory.binding, factory.moduleStart)) fail()
    const componentRoot =
      owner.type === 'JSXElement' ? component(tag) : undefined
    if (componentRoot) {
      const root = tagPath(tag)!.root,
        originalParents = originals.find(
          (value) => value.node === owner
        )!.parents
      if (
        shadowed(originalParents, root, 0, componentRoot.source.node) ||
        shadowed(parents, root, factory.moduleStart, componentRoot.actual.node)
      )
        fail()
    }
    used.add(call)
    const attributes = owner.openingElement?.attributes ?? [],
      actualProps = call.arguments[1]
    let properties: Node[] = []
    if (attributes.length || automatic.length) {
      if (
        actualProps?.type !== 'ObjectExpression' ||
        actualProps.properties.some(
          (property: Node) =>
            property.type !== 'Property' ||
            property.computed ||
            property.method ||
            property.kind !== 'init'
        )
      )
        fail()
      properties = actualProps.properties
    } else if (actualProps?.type !== 'Literal' || actualProps.value !== null)
      fail()
    const propertyName = (property: Node) =>
      property.key?.type === 'Identifier'
        ? property.key.name
        : property.key?.value
    const actualChildren = automatic.length
      ? properties.filter((property) => propertyName(property) === 'children')
      : []
    const props = automatic.length
      ? properties.filter((property) => propertyName(property) !== 'children')
      : properties
    if (
      props.length !== attributes.length ||
      new Set(props.map(propertyName)).size !== props.length
    )
      fail()
    for (const attribute of attributes) {
      const matches = props.filter(
        (property) => propertyName(property) === attribute.name.name
      )
      if (
        matches.length !== 1 ||
        !exact(matches[0].key.loc.start, attribute.name.loc.start)
      )
        fail()
      if (attribute.value === null) {
        const value = matches[0].value
        if (value?.type !== 'Literal' || value.value !== true) fail()
        if (automatic.length) {
          if (
            !exact(matches[0].key.loc.end, attribute.name.loc.end) ||
            decoded.mappings.some((mapping) => {
              const at = {
                line: mapping.generatedLine,
                column: mapping.generatedColumn,
              }
              return (
                !before(at, value.loc.start) &&
                !before(value.loc.end, at) &&
                (mapping.source !== options.file ||
                  ![attribute.name.loc.start, attribute.name.loc.end].some(
                    (point: Point) =>
                      same(point, {
                        line: mapping.originalLine!,
                        column: mapping.originalColumn!,
                      })
                  ))
              )
            })
          )
            fail()
        } else if (!exact(value.loc.start, attribute.name.loc.start)) fail()
      } else
        expression(
          attribute.value.type === 'JSXExpressionContainer'
            ? attribute.value.expression
            : attribute.value,
          matches[0].value
        )
    }
    let actualValues: Node[]
    if (automatic.length) {
      if (
        actualChildren.length !== (values.length ? 1 : 0) ||
        call.arguments.length !== 2
      )
        fail()
      const value = actualChildren[0]?.value
      if (values.length > 1) {
        if (
          value?.type !== 'ArrayExpression' ||
          value.elements.some((item: Node) => !item)
        )
          fail()
        actualValues = value.elements
      } else actualValues = value ? [value] : []
    } else actualValues = call.arguments.slice(2)
    if (actualValues.length !== values.length) fail()
    for (let index = 0; index < values.length; index++)
      expression(values[index], actualValues[index])
    if (
      decoded.mappings.some((mapping) => {
        const at = {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        }
        const original = replacements.get(mapping) ?? {
          line: mapping.originalLine!,
          column: mapping.originalColumn!,
        }
        return (
          !before(at, call.loc.start) &&
          before(at, call.loc.end) &&
          mapping.source !== null &&
          (mapping.source !== options.file ||
            before(original, owner.loc.start) ||
            !before(original, owner.loc.end))
        )
      })
    )
      fail()
    const closing = owner.closingElement ?? owner.closingFragment,
      selfClosing =
        owner.type === 'JSXElement' && owner.openingElement.selfClosing === true
    if (
      source![owner.end - 1] !== '>' ||
      options.code[call.end - 1] !== ')' ||
      (selfClosing
        ? closing ||
          owner.children.length ||
          !same(owner.openingElement.loc.end, owner.loc.end) ||
          source!.slice(owner.end - 2, owner.end) !== '/>'
        : !closing ||
          !same(closing.loc.end, owner.loc.end) ||
          (owner.type === 'JSXElement' &&
            (closing.type !== 'JSXClosingElement' ||
              !sameTagName(tag, closing.name))) ||
          (owner.type === 'JSXFragment' &&
            (closing.type !== 'JSXClosingFragment' ||
              source!.slice(closing.start, closing.end) !== '</>')))
    )
      fail()
    const point = { line: call.loc.end.line, column: call.loc.end.column - 1 },
      original = { line: owner.loc.end.line, column: owner.loc.end.column - 1 }
    if (
      point.column < 0 ||
      original.column < 0 ||
      !before(owner.loc.start, original)
    )
      fail()
    const previous = decoded.mappings.filter((mapping) =>
      same(
        { line: mapping.generatedLine, column: mapping.generatedColumn },
        point
      )
    )
    const memberChild =
      values.length === 1 &&
      values[0].type === 'MemberExpression' &&
      call.arguments[2]?.type === 'MemberExpression' &&
      same(point, call.arguments[2].loc.end) &&
      exact(point, values[0].loc.end)
    if (
      previous.some(
        (mapping) =>
          mapping.source !== options.file ||
          (!same(
            { line: mapping.originalLine!, column: mapping.originalColumn! },
            original
          ) &&
            !memberChild)
      ) ||
      terminals.some((mapping) => same(mapping.generated, point))
    )
      fail()
    if (!previous.length) terminals.push({ generated: point, original })
    if (
      same(
        owner.loc.start,
        owner.openingElement?.loc?.start ?? owner.openingFragment?.loc?.start
      ) &&
      owner.loc.start.line === owner.loc.end.line
    )
      for (const child of owner.children) {
        const value =
          child.type === 'JSXExpressionContainer' ? child.expression : undefined
        if (
          (value?.type === 'LogicalExpression' &&
            value.operator === '&&' &&
            isJsx(value.right)) ||
          (value?.type === 'ConditionalExpression' &&
            isJsx(value.consequent) &&
            isJsx(value.alternate))
        )
          ownedChildren.add(browserJsxChildKey(value))
      }
    return call
  }
  function expression(original: Node, actual: Node): void {
    if (isJsx(original)) {
      if (associate(original) !== actual) fail()
      return
    }
    if (!actual || !exact(actual.loc.start, original.loc.start)) fail()
    if (original.type === 'JSXText') {
      if (actual.type !== 'Literal' || actual.value !== original.value) fail()
    } else if (original.type === 'Identifier') {
      if (actual.type !== original.type || actual.name !== original.name) fail()
    } else if (original.type === 'Literal') {
      if (actual.type !== original.type || actual.value !== original.value)
        fail()
    } else if (original.type === 'ThisExpression') {
      if (actual.type !== original.type) fail()
    } else if (original.type === 'MemberExpression') {
      if (
        actual.type !== original.type ||
        original.computed ||
        actual.computed ||
        original.optional ||
        actual.optional ||
        original.property?.type !== 'Identifier' ||
        actual.property?.type !== 'Identifier' ||
        actual.property.name !== original.property.name ||
        !exact(actual.property.loc.start, original.property.loc.start)
      )
        fail()
      expression(original.object, actual.object)
    } else if (original.type === 'LogicalExpression') {
      if (
        actual.type !== original.type ||
        actual.operator !== original.operator
      )
        fail()
      expression(original.left, actual.left)
      expression(original.right, actual.right)
    } else if (original.type === 'ConditionalExpression') {
      if (actual.type !== original.type) fail()
      expression(original.test, actual.test)
      expression(original.consequent, actual.consequent)
      expression(original.alternate, actual.alternate)
    } else fail()
  }
  const roots = originals.filter(
    ({ node, parents }) => isJsx(node) && !parents.some(isJsx)
  )
  if (pragma && roots.some(({ node }) => !supported(node))) return
  for (const { node } of roots) if (supported(node)) associate(node)
  if (!used.size) return
  const output = new SourceMapGenerator()
  for (const mapping of decoded.mappings) {
    const at = { line: mapping.generatedLine, column: mapping.generatedColumn }
    if (mapping.source === null)
      (output.addMapping as (value: { generated: Point }) => void)({
        generated: at,
      })
    else
      output.addMapping({
        generated: at,
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
  for (const mapping of terminals)
    output.addMapping({ ...mapping, source: options.file })
  for (const [file, content] of decoded.sources)
    if (content !== null) output.setSourceContent(file, content)
  return { sourceMap: JSON.parse(output.toString()), children: ownedChildren }
}
