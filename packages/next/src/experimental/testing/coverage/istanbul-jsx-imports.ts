import { traverse } from 'next/dist/compiled/babel/core'
import { parse } from 'next/dist/compiled/babel/parser'
import { isDeepStrictEqual } from 'util'
import { coverageHash } from './artifact'
import { decodeCoverageMap } from './maps'
import { verifiedNativeImportInventory } from './import-roles'
import type { NodePath, Binding } from '@babel/traverse'
import type { Node, Program, CallExpression, Identifier } from '@babel/types'
import type { CompiledTestArtifact } from '../contracts'
import type { IstanbulInstrumentationMetadata } from './istanbul-types'
import type { CompilerTransformSourceMap } from '../compiler/transform-hooks'

type Point = { line: number; column: number }
function fail(): never {
  throw new Error('Invalid actual Istanbul JSX import ownership.')
}
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0
const exact = (value: any, keys: string[]) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))
const point = (value: any): value is Point =>
  exact(value, ['line', 'column']) &&
  integer(value.line) &&
  integer(value.column)
const add = (offset: Point, value: Point): Point => ({
  line: offset.line + value.line,
  column: value.column + (value.line === 0 ? offset.column : 0),
})
const position = (value: Point) => ({ line: value.line, column: value.column })
const key = (value: Point) => `${value.line}:${value.column}`

/** Bind only the exact imported callee; every other instrumented node stays exact. */
export async function readIstanbulJsxImportProjection({
  artifact,
  source,
  generated,
  metadata,
  code,
  rawMap,
  tree,
  scope,
}: {
  artifact: CompiledTestArtifact
  source: IstanbulInstrumentationMetadata['sources'][number]
  generated: { code: string; map: CompilerTransformSourceMap }
  metadata: NonNullable<CompiledTestArtifact['coverage']>['scripts'][number]
  code: string
  rawMap: unknown
  tree: unknown
  scope: unknown
}): Promise<(value: unknown) => unknown> {
  const proof = await verifiedNativeImportInventory(artifact)
  const expectedFile = parse(generated.code, { sourceType: 'module' })
  const expected = expectedFile.program as Program
  const declarations = expected.body.flatMap((node, declarationOrder) => {
    if (node.type !== 'ImportDeclaration') return []
    if (
      !['react/jsx-runtime', 'react/jsx-dev-runtime'].includes(
        node.source.value
      ) ||
      node.importKind === 'type' ||
      node.attributes?.length ||
      !node.loc
    )
      fail()
    const specifiers = node.specifiers.map((specifier) => {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.importKind === 'type'
      )
        fail()
      const imported =
        specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : specifier.imported.value
      if (!['jsx', 'jsxs', 'jsxDEV'].includes(imported)) fail()
      return { kind: 'named', local: specifier.local.name, imported }
    })
    if (!specifiers.length) fail()
    return [
      {
        request: node.source.value,
        declaration: {
          declarationOrder,
          sourceRange: {
            start: position(node.loc.start),
            end: position(node.loc.end),
          },
          specifiers,
        },
      },
    ]
  })
  if (!declarations.length) fail()
  const aliases = new Map<
    string,
    { request: string; imported: string; binding?: Binding }
  >()
  for (const { request, declaration } of declarations)
    for (const specifier of declaration.specifiers) {
      if (aliases.has(specifier.local)) fail()
      aliases.set(specifier.local, { request, imported: specifier.imported })
    }
  traverse(expectedFile, {
    ImportSpecifier(path) {
      const alias = aliases.get(path.node.local.name)
      if (!alias || alias.binding) fail()
      alias.binding = path.scope.getBinding(path.node.local.name)
      if (
        !alias.binding ||
        !alias.binding.constant ||
        alias.binding.constantViolations.length
      )
        fail()
    },
  })
  const authored = source.initial.inputSourceMap?.sourcesContent?.[0]
  if (typeof authored !== 'string' || coverageHash(authored) !== source.sha256)
    fail()
  const original = parse(authored, {
    sourceType: 'module',
    plugins: source.file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['jsx'],
  })
  const elements = new Map<string, string>()
  traverse(original, {
    JSXOpeningElement(path) {
      const name = path.node.name
      if (name.type !== 'JSXIdentifier' || !name.loc) fail()
      const at = key(name.loc.start)
      if (elements.has(at)) fail()
      elements.set(at, name.name)
    },
  })
  const expectedMap = decodeCoverageMap(generated.map),
    actualMap = decodeCoverageMap(rawMap)
  function anchor(call: CallExpression, emitted: boolean) {
    const tag = call.arguments[0]
    if (tag?.type !== 'StringLiteral' || !tag.loc) fail()
    const decoded = emitted ? actualMap : expectedMap
    const matches = decoded.mappings.filter(
      (mapping) =>
        mapping.generatedLine === tag.loc!.start.line &&
        mapping.generatedColumn === tag.loc!.start.column
    )
    if (
      matches.length !== 1 ||
      matches[0].source === null ||
      matches[0].originalLine === null ||
      matches[0].originalColumn === null
    )
      fail()
    const role = matches[0],
      identity = role.source!
    if (
      decoded.sources.get(identity) !== authored ||
      (emitted
        ? !isDeepStrictEqual(artifact.coverage!.sources[identity], {
            file: source.file,
            sha256: source.sha256,
          })
        : identity !== source.file)
    )
      fail()
    const at = key({ line: role.originalLine!, column: role.originalColumn! })
    if (elements.get(at) !== tag.value) fail()
    return at
  }
  const expectedCalls = new Map<string, Identifier>()
  traverse(expectedFile, {
    CallExpression(path) {
      const callee = path.node.callee
      if (callee.type !== 'Identifier') return
      const alias = aliases.get(callee.name)
      if (!alias) return
      if (path.scope.getBinding(callee.name) !== alias.binding) fail()
      const at = anchor(path.node, false)
      if (expectedCalls.has(at)) fail()
      expectedCalls.set(at, callee)
    },
  })
  if (!expectedCalls.size) fail()
  const starts = [0],
    ends: number[] = []
  for (const match of code.matchAll(/\r\n|[\n\r\u2028\u2029]/g)) {
    ends.push(match.index!)
    starts.push(match.index! + match[0].length)
  }
  ends.push(code.length)
  function offset(value: Point): number {
    if (!point(value) || value.line >= starts.length) fail()
    const result = starts[value.line] + value.column
    if (result > ends[value.line] || result > code.length) fail()
    return result
  }
  const owned: { data: any; origin: Point; script: string }[] = []
  for (const script of proof.data.scripts)
    for (const section of script.sections) {
      if (!exact(section, ['offset', 'data']) || !point(section.offset)) fail()
      const data = section.data
      if (
        data?.kind === 'node-import-initializers' &&
        data.issuer?.sha256 === coverageHash(generated.code)
      )
        owned.push({ data, origin: section.offset, script: script.path })
    }
  if (owned.length !== 1 || owned[0].script !== metadata.path) fail()
  const { data, origin } = owned[0]
  if (
    !exact(data, ['version', 'kind', 'issuer', 'moduleEnd', 'roles']) ||
    data.version !== 1 ||
    !exact(data.issuer, ['sha256']) ||
    !point(data.moduleEnd) ||
    !Array.isArray(data.roles) ||
    !data.roles.length
  )
    fail()
  const moduleStart = offset(origin),
    moduleEnd = offset(add(origin, data.moduleEnd))
  const paths = new Map<Node, NodePath>()
  traverse(
    { type: 'File', program: tree as Program },
    {
      enter(path) {
        paths.set(path.node, path)
      },
    }
  )
  const scopePath = paths.get(scope as Node)
  const factory = scopePath?.parentPath
  if (
    !scopePath?.isBlockStatement() ||
    !factory?.isArrowFunctionExpression() ||
    factory.node.body !== scope ||
    factory.node.params.length !== 1 ||
    factory.node.params[0].type !== 'Identifier' ||
    !factory.parentPath?.isArrayExpression() ||
    moduleStart <= scopePath.node.start! ||
    moduleEnd > scopePath.node.end!
  )
    fail()
  const contextParameter = factory.node.params[0]
  const namespaceBindings = new Map<
    string,
    { binding: Binding; request: string; references: Set<Node> }
  >()
  let previous = moduleStart
  for (const role of data.roles) {
    if (
      !exact(role, [
        'kind',
        'start',
        'end',
        'binding',
        'context',
        'target',
        'source',
        'request',
        'imports',
      ]) ||
      role.kind !== 'esm-import-initializer' ||
      !point(role.start) ||
      !point(role.end) ||
      typeof role.binding !== 'string' ||
      !role.binding ||
      typeof role.context !== 'string' ||
      !role.context ||
      !exact(role.target, ['kind', 'value']) ||
      (role.target.kind === 'string'
        ? typeof role.target.value !== 'string'
        : role.target.kind !== 'number' || !integer(role.target.value)) ||
      !Array.isArray(role.imports)
    )
      fail()
    const requestDeclarations = declarations
      .filter((value) => value.request === role.request)
      .map((value) => value.declaration)
    if (
      !requestDeclarations.length ||
      !isDeepStrictEqual(requestDeclarations, role.imports) ||
      requestDeclarations.filter((value) =>
        isDeepStrictEqual(value.sourceRange, role.source)
      ).length !== 1
    )
      fail()
    const start = offset(add(origin, role.start)),
      end = offset(add(origin, role.end))
    if (
      start < previous ||
      end <= start ||
      end > moduleEnd ||
      namespaceBindings.has(role.request)
    )
      fail()
    previous = end
    const candidates = scopePath.node.body.filter(
      (node) => node.start === start && node.end === end
    )
    if (
      candidates.length !== 1 ||
      candidates[0].type !== 'VariableDeclaration' ||
      candidates[0].kind !== 'var' ||
      candidates[0].declarations.length !== 1
    )
      fail()
    const declaration = candidates[0].declarations[0],
      init = declaration.init
    if (
      declaration.id.type !== 'Identifier' ||
      declaration.id.name !== role.binding ||
      init?.type !== 'CallExpression' ||
      init.optional ||
      init.callee.type !== 'MemberExpression' ||
      init.callee.optional ||
      init.callee.computed ||
      init.callee.object.type !== 'Identifier' ||
      init.callee.object.name !== role.context ||
      role.context !== contextParameter.name ||
      init.callee.property.type !== 'Identifier' ||
      init.callee.property.name !== 'i' ||
      init.arguments.length !== 1 ||
      init.arguments[0].type !==
        (role.target.kind === 'string' ? 'StringLiteral' : 'NumericLiteral') ||
      (init.arguments[0] as { value: unknown }).value !== role.target.value
    )
      fail()
    const declarationPath = paths.get(declaration),
      contextBinding = factory.scope.getBinding(role.context),
      binding = declarationPath?.scope.getBinding(role.binding)
    if (
      !binding ||
      binding.path.node !== declaration ||
      !binding.constant ||
      binding.constantViolations.length ||
      !contextBinding ||
      contextBinding.path.node !== contextParameter ||
      !contextBinding.constant ||
      contextBinding.constantViolations.length ||
      paths.get(init.callee.object)?.scope.getBinding(role.context) !==
        contextBinding
    )
      fail()
    namespaceBindings.set(role.request, {
      binding,
      request: role.request,
      references: new Set(),
    })
  }
  if (
    new Set(declarations.map((value) => value.request)).size !==
    namespaceBindings.size
  )
    fail()
  const projected = new WeakMap<object, Identifier>(),
    consumed = new Set<string>()
  scopePath.traverse({
    CallExpression(path) {
      const callee = path.node.callee
      if (
        callee.type !== 'SequenceExpression' ||
        callee.expressions.length !== 2 ||
        callee.expressions[0].type !== 'NumericLiteral' ||
        callee.expressions[0].value !== 0
      )
        return
      const member = callee.expressions[1]
      if (
        member.type !== 'MemberExpression' ||
        member.optional ||
        !member.computed ||
        member.object.type !== 'Identifier' ||
        member.property.type !== 'StringLiteral'
      )
        return
      const binding = path.scope.getBinding(member.object.name)
      const owners = [...namespaceBindings.values()].filter(
        (value) => value.binding === binding
      )
      if (!owners.length) return
      if (owners.length !== 1 || path.node.optional) fail()
      const at = anchor(path.node, true),
        expectedCallee = expectedCalls.get(at)
      if (!expectedCallee || consumed.has(at)) fail()
      const alias = aliases.get(expectedCallee.name)!
      if (
        alias.request !== owners[0].request ||
        alias.imported !== member.property.value
      )
        fail()
      consumed.add(at)
      owners[0].references.add(member.object)
      projected.set(callee, expectedCallee)
    },
  })
  if (consumed.size !== expectedCalls.size) fail()
  for (const { binding, references } of namespaceBindings.values())
    if (
      binding.referencePaths.length !== references.size ||
      binding.referencePaths.some((path) => !references.has(path.node))
    )
      fail()
  return (value) =>
    value && typeof value === 'object' ? projected.get(value) : undefined
}
