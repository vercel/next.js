import { parse } from 'next/dist/compiled/babel/parser'
import { isDeepStrictEqual } from 'util'
import { assertBrowserCoverageArtifact } from '../client/coverage-artifact'
import { coverageHash, readArtifactFile } from './artifact'
import { decodeCoverageMap } from './maps'
import {
  normalizeBrowserCreatorScopes,
  type BrowserCreatorScope,
  type BrowserCreatorMethod,
} from './browser-creator-scope'
import type { CompiledTestArtifact } from '../contracts'
import type { CoverageArtifactMetadata, StandardCoverageData } from './types'

type Point = { line: number; column: number }
type Node = { type: string; start: number; end: number; [key: string]: any }
export type BrowserImportStatement = { start: Point; count: number }
export type BrowserClassicFactory = {
  binding: string
  moduleStart: number
  moduleEnd: number
  namedPragma?: {
    local: string
    start: Point
    end: Point
    fragment?: { local: string; start: Point; end: Point }
  }
}
export type BrowserAutomaticFactory = {
  binding: string
  moduleStart: number
  moduleEnd: number
  imports: readonly string[]
}
/** This role uses actual development calls, without a production factory grant. */
function ownsDevelopmentJsxCalls(
  role: any,
  moduleStart: number,
  moduleEnd: number,
  moduleId: unknown,
  authored: unknown,
  emitted: unknown
): boolean {
  if (
    role.request !== 'react/jsx-dev-runtime' ||
    role.resolvedFormat !== 'commonjs' ||
    role.imports.length !== 1 ||
    role.imports[0].origin !== 'generated'
  )
    return false
  const imported = role.imports[0]
  if (
    !keys(imported, ['declarationOrder', 'origin', 'specifiers']) ||
    !Array.isArray(imported.specifiers) ||
    !imported.specifiers.length ||
    imported.specifiers.some(
      (value: any) =>
        !keys(value, ['kind', 'local', 'imported']) ||
        value.kind !== 'named' ||
        typeof value.local !== 'string' ||
        !value.local ||
        !['jsxDEV', 'Fragment'].includes(value.imported)
    ) ||
    imported.specifiers.filter((value: any) => value.imported === 'jsxDEV')
      .length !== 1 ||
    new Set(imported.specifiers.map((value: any) => value.local)).size !==
      imported.specifiers.length ||
    new Set(imported.specifiers.map((value: any) => value.imported)).size !==
      imported.specifiers.length
  )
    fail()
  const suffix = ' [next-test-client] (ecmascript)'
  if (
    typeof moduleId !== 'string' ||
    !moduleId.startsWith('[project]/') ||
    !moduleId.endsWith(suffix)
  )
    fail()
  // The existing native section binds this exact factory/module ID to the issuer.
  const nativeFileName = moduleId.slice(0, -suffix.length)
  const originals: Node[] = []
  walk(authored, (node) => {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment')
      originals.push(node)
  })
  const members: { node: Node; parents: Node[] }[] = []
  walk(emitted, (node, parents) => {
    if (
      node.type === 'MemberExpression' &&
      node.object?.type === 'Identifier' &&
      node.object.name === role.binding &&
      node.start >= moduleStart &&
      node.end <= moduleEnd
    )
      members.push({ node, parents })
  })
  const calls = new Map<Node, Node>()
  const originalOwners = new Set<Node>()
  const fragmentImported = imported.specifiers.some(
    (value: any) => value.imported === 'Fragment'
  )
  const member = (node: Node, name: string) =>
    node?.type === 'MemberExpression' &&
    !node.optional &&
    node.computed === true &&
    node.object?.type === 'Identifier' &&
    node.object.name === role.binding &&
    node.property?.type === 'Literal' &&
    node.property.value === name
  for (const { node, parents } of members) {
    if (member(node, 'Fragment')) continue
    const sequence = parents.at(-1),
      call = parents.at(-2)
    if (
      !member(node, 'jsxDEV') ||
      sequence?.type !== 'SequenceExpression' ||
      sequence.expressions.length !== 2 ||
      sequence.expressions[0].type !== 'Literal' ||
      sequence.expressions[0].value !== 0 ||
      sequence.expressions[1] !== node ||
      call?.type !== 'CallExpression' ||
      call.callee !== sequence ||
      call.optional ||
      call.start < moduleStart ||
      call.end > moduleEnd ||
      call.arguments.length !== 6 ||
      call.arguments.some((value: Node) => value.type === 'SpreadElement') ||
      call.arguments[3]?.type !== 'Literal' ||
      typeof call.arguments[3].value !== 'boolean' ||
      call.arguments[4]?.type !== 'ObjectExpression'
    )
      fail()
    const properties = call.arguments[4].properties
    const fields = new Map<string, Node>()
    for (const property of properties) {
      const name = property.key?.name ?? property.key?.value
      if (
        property.type !== 'Property' ||
        property.computed ||
        property.method ||
        property.kind !== 'init' ||
        !['fileName', 'lineNumber', 'columnNumber'].includes(name) ||
        fields.has(name) ||
        property.value?.type !== 'Literal'
      )
        fail()
      fields.set(name, property.value)
    }
    const filename = fields.get('fileName')?.value,
      line = fields.get('lineNumber')?.value,
      column = fields.get('columnNumber')?.value
    if (
      fields.size !== 3 ||
      filename !== nativeFileName ||
      !integer(line) ||
      line < 1 ||
      !integer(column) ||
      column < 1
    )
      fail()
    const matches = originals.filter(
      (value) =>
        value.loc.start.line === line && value.loc.start.column + 1 === column
    )
    if (
      matches.length !== 1 ||
      originalOwners.has(matches[0]) ||
      (matches[0].type === 'JSXFragment') !==
        (fragmentImported && member(call.arguments[0], 'Fragment'))
    )
      fail()
    originalOwners.add(matches[0])
    calls.set(call, matches[0])
  }
  if (!calls.size) fail()
  for (const { node, parents } of members) {
    if (!member(node, 'Fragment')) continue
    const call = parents.at(-1)
    if (
      !fragmentImported ||
      !call ||
      call.arguments?.[0] !== node ||
      calls.get(call)?.type !== 'JSXFragment'
    )
      fail()
  }
  return true
}
function fail(): never {
  throw new Error(
    'Unsupported or ambiguous native Browser import coverage ownership'
  )
}
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0
const keys = (value: any, names: string[]) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name))
const point = (value: any): value is Point =>
  keys(value, ['line', 'column']) &&
  integer(value.line) &&
  integer(value.column)
const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
const same = (a: Point, b: Point) => compare(a, b) === 0
const add = (origin: Point, value: Point): Point => ({
  line: origin.line + value.line,
  column: value.column + (value.line === 0 ? origin.column : 0),
})
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
  for (const [name, child] of Object.entries(value))
    if (!['loc', 'comments', 'tokens'].includes(name)) walk(child, visit, next)
}
function specifiers(imported: Node) {
  return imported.specifiers.map((specifier: Node) => ({
    kind:
      specifier.type === 'ImportDefaultSpecifier'
        ? 'default'
        : specifier.type === 'ImportNamespaceSpecifier'
          ? 'namespace'
          : 'named',
    local: specifier.local.name,
    imported:
      specifier.type === 'ImportDefaultSpecifier'
        ? 'default'
        : specifier.type === 'ImportNamespaceSpecifier'
          ? '*'
          : (specifier.imported.name ?? specifier.imported.value),
  }))
}

function retainedAuthoredSpecifiers(
  imported: Node,
  retained: unknown,
  parsed: ReturnType<typeof parse>
): boolean {
  const original = specifiers(imported)
  if (isDeepStrictEqual(original, retained)) return true
  const defaultImport =
    original.length === 3 &&
    original[0].kind === 'default' &&
    original[0].imported === 'default'
      ? original[0]
      : undefined
  const named = defaultImport ? original.slice(1) : original
  const keepsDefault =
    defaultImport && isDeepStrictEqual(retained, [defaultImport, named[0]])
  if (
    imported.source.value !== 'react' ||
    imported.importKind === 'type' ||
    imported.specifiers.some(
      (specifier: Node) => specifier.importKind === 'type'
    ) ||
    named.length !== 2 ||
    named[0].kind !== 'named' ||
    named[0].imported !== 'createElement' ||
    named[1].kind !== 'named' ||
    named[1].imported !== 'Fragment' ||
    new Set(original.map((value: any) => value.local)).size !==
      original.length ||
    (!keepsDefault && !isDeepStrictEqual(retained, [named[0]]))
  )
    return false
  const comments = parsed.comments ?? []
  const jsx = comments.filter((comment) => /@jsx\b/.test(comment.value))
  const fragment = comments.filter((comment) =>
    /@jsxFrag\b/.test(comment.value)
  )
  if (
    jsx.length !== 1 ||
    fragment.length !== 1 ||
    jsx[0].type !== 'CommentBlock' ||
    fragment[0].type !== 'CommentBlock' ||
    jsx[0].value.trim() !== '* @jsx ' + named[0].local ||
    fragment[0].value.trim() !== '* @jsxFrag ' + named[1].local ||
    jsx[0].loc!.start.line !== jsx[0].loc!.end.line ||
    fragment[0].loc!.start.line !== fragment[0].loc!.end.line
  )
    return false
  let valid = true,
    elements = 0
  walk(parsed.program, (node, parents) => {
    if (node.type === 'JSXElement') elements++
    if (
      node.type === 'JSXFragment' ||
      (['Identifier', 'JSXIdentifier'].includes(node.type) &&
        (node.name === named[1].local ||
          (defaultImport &&
            !keepsDefault &&
            node.name === defaultImport.local)) &&
        !parents.includes(imported))
    )
      valid = false
  })
  return valid && elements > 0
}

/** Only the native v2 Browser certificate carries these actual generated sections. */
export async function prepareBrowserImportInitializers(options: {
  artifact: CompiledTestArtifact
  metadata: CoverageArtifactMetadata['scripts'][number]
  code: string
  rawMap: unknown
  ast: unknown
  selectedSources: ReadonlyMap<string, string>
  generatedCoverage(): Promise<StandardCoverageData>
}): Promise<{
  ast: unknown
  statements: ReadonlyMap<string, readonly BrowserImportStatement[]>
  classicFactories: ReadonlyMap<string, readonly BrowserClassicFactory[]>
  automaticFactories: ReadonlyMap<string, readonly BrowserAutomaticFactory[]>
  creatorMethods: ReadonlyMap<string, readonly BrowserCreatorMethod[]>
}> {
  const { artifact, metadata, code, selectedSources } = options
  const statements = new Map<string, BrowserImportStatement[]>(),
    classicFactories = new Map<string, BrowserClassicFactory[]>(),
    automaticFactories = new Map<string, BrowserAutomaticFactory[]>()
  const creatorMethods = new Map<string, BrowserCreatorMethod[]>()
  const developmentJsxRoles = new WeakSet<object>()
  const browser = artifact.coverage?.browser
  const development =
    browser?.version === 1 && browser.developmentImports?.mode === 'development'
  const production =
    browser?.version === 2 && browser.importInitializers?.version === 1
  if (!browser || (!production && !development))
    return {
      ast: options.ast,
      statements,
      classicFactories,
      automaticFactories,
      creatorMethods,
    }
  if (
    artifact.kind !== 'browser' ||
    artifact.profile.mode !== (development ? 'development' : 'production')
  )
    fail()
  await assertBrowserCoverageArtifact(artifact)
  const bytes = await readArtifactFile(
    artifact.rootDir,
    browser.nativeMetadata.path
  )
  if (coverageHash(bytes) !== browser.nativeMetadata.sha256) fail()
  const certificate = JSON.parse(bytes.toString('utf8'))
  const ownedImports = development
    ? certificate.developmentImports
    : certificate.importInitializers
  if (
    development &&
    (certificate.version !== 1 ||
      ownedImports?.version !== 1 ||
      ownedImports?.mode !== 'development' ||
      certificate.importInitializers !== undefined)
  )
    fail()
  const sections = ownedImports?.sectionsByScript?.[metadata.path]
  if (sections === undefined)
    return {
      ast: options.ast,
      statements,
      classicFactories,
      automaticFactories,
      creatorMethods,
    }
  if (!Array.isArray(sections) || !sections.length) fail()
  const starts = [0],
    ends: number[] = []
  for (const match of code.matchAll(/\r\n|[\n\r\u2028\u2029]/g)) {
    ends.push(match.index!)
    starts.push(match.index! + match[0].length)
  }
  ends.push(code.length)
  function offset(value: Point) {
    if (!point(value) || value.line >= starts.length) fail()
    const result = starts[value.line] + value.column
    if (result > ends[value.line]) fail()
    return result
  }
  const decoded = decodeCoverageMap(options.rawMap)
  const nodes: { node: Node; parents: Node[] }[] = []
  walk(options.ast, (node, parents) => {
    if (node.type === 'VariableDeclaration') nodes.push({ node, parents })
  })
  const remove = new Set<number>()
  const creatorScopes: BrowserCreatorScope[] = []
  const occupied: { start: number; end: number }[] = []
  const byFile = new Map<
    string,
    {
      authored: Node[]
      comments: any[]
      owners: { role: any; declaration: Node }[]
      moduleStart: number
      moduleEnd: number
    }
  >()
  for (const section of sections) {
    if (!keys(section, ['offset', 'data']) || !point(section.offset)) fail()
    const origin: Point = section.offset,
      data = section.data
    if (
      !keys(data, ['version', 'kind', 'issuer', 'moduleEnd', 'roles']) ||
      data.version !== 1 ||
      data.kind !== 'browser-import-initializers' ||
      !keys(data.issuer, ['sha256']) ||
      !/^[a-f0-9]{64}$/.test(data.issuer.sha256) ||
      !point(data.moduleEnd) ||
      !Array.isArray(data.roles) ||
      !data.roles.length
    )
      fail()
    const moduleStart = offset(origin),
      moduleEnd = offset(add(origin, data.moduleEnd))
    if (moduleEnd <= moduleStart) fail()
    // Identity comes from the actual module's validated mappings, not a path guessed
    // from a hash. Equal-byte issuers within one native section stay ambiguous.
    const issuers = new Map<string, { file: string; sha256: string }>()
    for (const mapping of decoded.mappings) {
      const at = offset({
        line: mapping.generatedLine - 1,
        column: mapping.generatedColumn,
      })
      if (at < moduleStart || at >= moduleEnd || mapping.source === null)
        continue
      const source = artifact.coverage!.sources[mapping.source]
      if (!source || source.sha256 !== data.issuer.sha256) continue
      const content = decoded.sources.get(mapping.source)
      if (
        typeof content !== 'string' ||
        coverageHash(content) !== source.sha256
      )
        fail()
      issuers.set(source.file, source)
    }
    if (issuers.size !== 1) fail()
    const source = [...issuers.values()][0]
    const content = selectedSources.get(source.file)
    if (content === undefined) continue
    if (
      !/\.[jt]sx$/.test(source.file) ||
      coverageHash(content) !== source.sha256 ||
      byFile.has(source.file)
    )
      fail()
    const parsed = parse(content, {
      sourceType: 'module',
      plugins: [
        'estree',
        'jsx',
        ...(/\.tsx$/.test(source.file) ? ['typescript' as const] : []),
      ],
    })
    const authored = parsed.program.body.filter(
      (node: any) => node.type === 'ImportDeclaration'
    ) as unknown as Node[]
    const owners: { role: any; declaration: Node }[] = []
    byFile.set(source.file, {
      authored,
      comments: parsed.comments ?? [],
      owners,
      moduleStart,
      moduleEnd,
    })
    let previous = moduleStart
    for (const role of data.roles) {
      if (
        !keys(role, [
          'kind',
          'start',
          'end',
          'binding',
          'context',
          'target',
          'request',
          'resolvedFormat',
          'imports',
        ]) ||
        role.kind !== 'esm-namespace-initializer' ||
        !point(role.start) ||
        !point(role.end) ||
        compare(role.start, role.end) >= 0 ||
        typeof role.binding !== 'string' ||
        !role.binding ||
        typeof role.context !== 'string' ||
        !role.context ||
        typeof role.request !== 'string' ||
        !role.request ||
        !['commonjs', 'esm'].includes(role.resolvedFormat) ||
        !keys(role.target, ['kind', 'value']) ||
        (role.target.kind === 'string'
          ? typeof role.target.value !== 'string'
          : role.target.kind !== 'number' || !integer(role.target.value)) ||
        !Array.isArray(role.imports) ||
        !role.imports.length
      )
        fail()
      const start = offset(add(origin, role.start)),
        end = offset(add(origin, role.end))
      if (
        start < previous ||
        end > moduleEnd ||
        occupied.some((value) => value.start < end && start < value.end)
      )
        fail()
      previous = end
      occupied.push({ start, end })
      const matches = nodes.filter(
        ({ node }) => node.start === start && node.end === end
      )
      if (matches.length !== 1) fail()
      const { node, parents } = matches[0]
      const parent = parents.at(-1),
        factory = parents.at(-2),
        container = parents.at(-3)
      if (
        parent?.type !== 'BlockStatement' ||
        factory?.type !== 'ArrowFunctionExpression' ||
        factory.body !== parent ||
        container?.type !== 'ArrayExpression' ||
        factory.params.length !== 1 ||
        factory.params[0].type !== 'Identifier' ||
        factory.params[0].name !== role.context ||
        moduleStart <= parent.start ||
        moduleEnd > parent.end ||
        node.kind !== 'var' ||
        node.declarations.length !== 1
      )
        fail()
      const index = container.elements.indexOf(factory),
        id = container.elements[index - 1]
      if (
        index < 1 ||
        id?.type !== 'Literal' ||
        !['string', 'number'].includes(typeof id.value)
      )
        fail()
      const declaration = node.declarations[0],
        init = declaration.init
      if (
        declaration.id?.type !== 'Identifier' ||
        declaration.id.name !== role.binding ||
        init?.type !== 'CallExpression' ||
        init.optional ||
        init.callee?.type !== 'MemberExpression' ||
        init.callee.computed ||
        init.callee.optional ||
        init.callee.object?.type !== 'Identifier' ||
        init.callee.object.name !== role.context ||
        init.callee.property?.name !== 'i' ||
        init.arguments.length !== 1 ||
        init.arguments[0].type !== 'Literal' ||
        typeof init.arguments[0].value !==
          (role.target.kind === 'string' ? 'string' : 'number') ||
        init.arguments[0].value !== role.target.value
      )
        fail()
      function binds(pattern: any): boolean {
        if (!pattern) return false
        if (pattern.type === 'Identifier') return pattern.name === role.context
        if (pattern.type === 'RestElement') return binds(pattern.argument)
        if (pattern.type === 'AssignmentPattern') return binds(pattern.left)
        if (pattern.type === 'ArrayPattern') return pattern.elements.some(binds)
        if (pattern.type === 'ObjectPattern')
          return pattern.properties.some((property: any) =>
            binds(
              property.type === 'RestElement'
                ? property.argument
                : property.value
            )
          )
        return false
      }
      function checkScope(value: any): void {
        if (!value || typeof value !== 'object') return
        if (Array.isArray(value)) {
          for (const child of value) checkScope(child)
          return
        }
        if (
          [
            'FunctionDeclaration',
            'FunctionExpression',
            'ArrowFunctionExpression',
          ].includes(value.type)
        ) {
          if (binds(value.id)) fail()
          return
        }
        if (
          (value.type === 'VariableDeclarator' && binds(value.id)) ||
          (value.type === 'ClassDeclaration' && binds(value.id)) ||
          (value.type === 'AssignmentExpression' && binds(value.left)) ||
          (value.type === 'UpdateExpression' && binds(value.argument))
        )
          fail()
        for (const [name, child] of Object.entries(value))
          if (!['loc', 'comments', 'tokens'].includes(name)) checkScope(child)
      }
      checkScope(parent)
      const creator =
        role.request === 'private-next-test-creator-scope' &&
        role.resolvedFormat === 'commonjs' &&
        role.imports.length === 1 &&
        role.imports[0]?.origin === 'generated' &&
        Array.isArray(role.imports[0].specifiers) &&
        role.imports[0].specifiers.length === 2 &&
        role.imports[0].specifiers.every(
          (specifier: any, specifierIndex: number) =>
            specifier.kind === 'named' &&
            typeof specifier.local === 'string' &&
            specifier.local.startsWith('__next_creator_') &&
            specifier.imported ===
              ['captureCreatorScope', 'enterCreatorScope'][specifierIndex]
        ) &&
        role.imports[0].specifiers[0].local !==
          role.imports[0].specifiers[1].local
      if (
        (role.request === 'private-next-test-creator-scope' && !creator) ||
        (creator &&
          creatorScopes.some((scope) => scope.moduleStart === moduleStart))
      )
        fail()
      const developmentJsx =
        development &&
        ownsDevelopmentJsxCalls(
          role,
          moduleStart,
          moduleEnd,
          id.value,
          parsed,
          options.ast
        )
      if (developmentJsx) developmentJsxRoles.add(role)
      for (const imported of role.imports) {
        if (
          !integer(imported.declarationOrder) ||
          !Array.isArray(imported.specifiers) ||
          ![
            'authored',
            'generated-jsx',
            ...(creator || developmentJsx ? ['generated'] : []),
          ].includes(imported.origin) ||
          !keys(
            imported,
            imported.origin === 'authored'
              ? ['declarationOrder', 'origin', 'specifiers', 'sourceRange']
              : ['declarationOrder', 'origin', 'specifiers']
          )
        )
          fail()
        for (const specifier of imported.specifiers) {
          if (
            !keys(specifier, ['kind', 'local', 'imported']) ||
            !['default', 'named', 'namespace'].includes(specifier.kind) ||
            typeof specifier.local !== 'string' ||
            !specifier.local ||
            typeof specifier.imported !== 'string' ||
            !specifier.imported ||
            (imported.origin === 'generated-jsx' &&
              (specifier.kind !== 'named' ||
                !['jsx', 'jsxs', 'Fragment'].includes(specifier.imported)))
          )
            fail()
        }
        if (imported.origin === 'authored') {
          if (
            !keys(imported.sourceRange, ['start', 'end']) ||
            !point(imported.sourceRange.start) ||
            !point(imported.sourceRange.end)
          )
            fail()
          const authoredMatches = authored.filter(
            (candidate) =>
              same(candidate.loc.start, imported.sourceRange.start) &&
              same(candidate.loc.end, imported.sourceRange.end)
          )
          if (
            authoredMatches.length !== 1 ||
            authoredMatches[0].source.value !== role.request ||
            !retainedAuthoredSpecifiers(
              authoredMatches[0],
              imported.specifiers,
              parsed
            )
          )
            fail()
        } else if (!imported.specifiers.length) fail()
      }
      remove.add(start)
      owners.push({ role, declaration })
      if (creator)
        creatorScopes.push({ binding: role.binding, moduleStart, moduleEnd })
    }
  }
  let generated: StandardCoverageData | undefined
  for (const [
    file,
    { authored, comments, owners, moduleStart, moduleEnd },
  ] of byFile) {
    const commonjs = owners.filter(
      ({ role }) =>
        role.resolvedFormat === 'commonjs' &&
        (role.imports[0]?.origin !== 'generated' ||
          developmentJsxRoles.has(role))
    )
    // Several authored declarations sharing one native namespace initializer need
    // their own reference-backed binding model; they cannot borrow its one count.
    if (commonjs.some(({ role }) => role.imports.length !== 1)) fail()
    const authoredOwners = commonjs
      .filter(({ role }) => role.imports[0].origin === 'authored')
      .sort((a, b) =>
        compare(
          a.role.imports[0].sourceRange.start,
          b.role.imports[0].sourceRange.start
        )
      )
    const jsxOwners = commonjs.filter(
      ({ role }) =>
        role.imports[0].origin === 'generated-jsx' ||
        developmentJsxRoles.has(role)
    )
    if (
      authoredOwners.length > 1 ||
      jsxOwners.length > 1 ||
      new Set(commonjs.map(({ role }) => JSON.stringify(role.target))).size !==
        commonjs.length
    )
      fail()
    if (jsxOwners.length === 1) {
      const role = jsxOwners[0].role
      const imported = role.imports[0]
      if (
        role.request === 'react/jsx-runtime' &&
        imported.specifiers.every(
          (specifier: any) =>
            specifier.kind === 'named' &&
            ['jsx', 'jsxs', 'Fragment'].includes(specifier.imported)
        ) &&
        new Set(imported.specifiers.map((value: any) => value.imported))
          .size === imported.specifiers.length
      )
        automaticFactories.set(file, [
          {
            binding: role.binding,
            moduleStart,
            moduleEnd,
            imports: imported.specifiers.map((value: any) => value.imported),
          },
        ])
    }
    // This conversion-local lease comes only from the actual native namespace
    // initializer, never from an authored import or an execution profile alone.
    if (
      owners.filter(({ role }) => role.imports[0]?.origin !== 'generated')
        .length === 1 &&
      authoredOwners.length === 1 &&
      !jsxOwners.length
    ) {
      const role = authoredOwners[0].role
      const imported = role.imports[0]
      if (
        role.request === 'react' &&
        imported.specifiers.length === 1 &&
        imported.specifiers[0].kind === 'default' &&
        imported.specifiers[0].local === 'React' &&
        imported.specifiers[0].imported === 'default'
      )
        classicFactories.set(file, [
          { binding: role.binding, moduleStart, moduleEnd },
        ])
      else if (
        role.request === 'react' &&
        ((imported.specifiers.length === 1 &&
          imported.specifiers[0].kind === 'named' &&
          imported.specifiers[0].imported === 'createElement') ||
          (imported.specifiers.length === 2 &&
            imported.specifiers[0].kind === 'default' &&
            imported.specifiers[0].imported === 'default' &&
            imported.specifiers[1].kind === 'named' &&
            imported.specifiers[1].imported === 'createElement'))
      ) {
        const local = imported.specifiers[imported.specifiers.length - 1].local
        const directives = comments.filter((comment) =>
          /@jsx\b/.test(comment.value)
        )
        if (
          directives.length === 1 &&
          directives[0].type === 'CommentBlock' &&
          directives[0].value.trim() === '* @jsx ' + local &&
          directives[0].loc.start.line === directives[0].loc.end.line
        )
          classicFactories.set(file, [
            {
              binding: role.binding,
              moduleStart,
              moduleEnd,
              namedPragma: {
                local,
                start: directives[0].loc.start,
                end: directives[0].loc.end,
              },
            },
          ])
      } else if (
        role.request === 'react' &&
        imported.specifiers.length === 2 &&
        imported.specifiers.every(
          (specifier: any) => specifier.kind === 'named'
        )
      ) {
        const callee = imported.specifiers.filter(
          (specifier: any) => specifier.imported === 'createElement'
        )
        const fragment = imported.specifiers.filter(
          (specifier: any) => specifier.imported === 'Fragment'
        )
        const jsx = comments.filter((comment) => /@jsx\b/.test(comment.value))
        const frag = comments.filter((comment) =>
          /@jsxFrag\b/.test(comment.value)
        )
        if (
          callee.length === 1 &&
          fragment.length === 1 &&
          callee[0].local !== fragment[0].local &&
          jsx.length === 1 &&
          frag.length === 1 &&
          jsx[0].type === 'CommentBlock' &&
          frag[0].type === 'CommentBlock' &&
          jsx[0].value.trim() === '* @jsx ' + callee[0].local &&
          frag[0].value.trim() === '* @jsxFrag ' + fragment[0].local &&
          jsx[0].loc.start.line === jsx[0].loc.end.line &&
          frag[0].loc.start.line === frag[0].loc.end.line
        )
          classicFactories.set(file, [
            {
              binding: role.binding,
              moduleStart,
              moduleEnd,
              namedPragma: {
                local: callee[0].local,
                start: jsx[0].loc.start,
                end: jsx[0].loc.end,
                fragment: {
                  local: fragment[0].local,
                  start: frag[0].loc.start,
                  end: frag[0].loc.end,
                },
              },
            },
          ])
      }
    }
    const first = authored.find(
      (node) =>
        node.start === 0 &&
        node.loc.start.line === 1 &&
        owners.some(({ role }) =>
          role.imports.some(
            (value: any) =>
              value.origin === 'authored' &&
              same(value.sourceRange.start, node.loc.start)
          )
        )
    )
    if (!first) {
      statements.set(file, [])
      continue
    }
    if (
      first.specifiers.length !== 1 ||
      first.specifiers[0].type === 'ImportNamespaceSpecifier'
    )
      fail()
    const points = [first.specifiers[0].local.loc.start, first.source.loc.start]
    const ordered = [...authoredOwners, ...jsxOwners]
    if (ordered.length > points.length) fail()
    generated ??= await options.generatedCoverage()
    const rows: BrowserImportStatement[] = []
    for (let index = 0; index < ordered.length; index++) {
      const declaration = ordered[index].declaration
      const matches = Object.entries(generated.statementMap).filter(
        ([, location]) => same(location.start, declaration.init.loc.start)
      )
      if (matches.length !== 1 || !integer(generated.s[matches[0][0]])) fail()
      rows.push({
        start: { line: points[index].line, column: points[index].column },
        count: generated.s[matches[0][0]],
      })
    }
    statements.set(file, rows)
  }
  if (!remove.size)
    return {
      ast: options.ast,
      statements,
      classicFactories,
      automaticFactories,
      creatorMethods,
    }
  const ast = structuredClone(options.ast)
  walk(ast, (node) => {
    if (node.type === 'BlockStatement')
      node.body = node.body.filter((value: Node) => !remove.has(value.start))
  })
  const normalized = normalizeBrowserCreatorScopes(ast, creatorScopes)
  for (const method of normalized.methods) {
    const selected = [...byFile].filter(
      ([, value]) =>
        value.moduleStart === method.scope.moduleStart &&
        value.moduleEnd === method.scope.moduleEnd
    )
    if (selected.length !== 1) fail()
    const file = selected[0][0],
      rows = creatorMethods.get(file) ?? []
    rows.push(method)
    creatorMethods.set(file, rows)
  }
  return {
    ast: normalized.ast,
    statements,
    classicFactories,
    automaticFactories,
    creatorMethods,
  }
}

/** Add only actual native CJS initializer counters to the measured Browser model. */
export function bindBrowserImportStatements(
  original: StandardCoverageData,
  observed: StandardCoverageData,
  imports: readonly BrowserImportStatement[]
): void {
  if (!imports.length) return
  for (const [data, runtime] of [
    [original, false],
    [observed, true],
  ] as const) {
    if (
      !data.meta ||
      Object.keys(data.statementMap).some(
        (id, index) => id !== String(index)
      ) ||
      !isDeepStrictEqual(Object.keys(data.statementMap), Object.keys(data.s))
    )
      fail()
    const statementMap: StandardCoverageData['statementMap'] = {},
      s: StandardCoverageData['s'] = {}
    for (const [index, imported] of imports.entries()) {
      if (
        !point(imported.start) ||
        imported.start.line < 1 ||
        !integer(imported.count)
      )
        fail()
      statementMap[index] = {
        start: { ...imported.start },
        end: { line: imported.start.line, column: Infinity },
      }
      s[index] = runtime ? imported.count : 0
    }
    for (const [id, location] of Object.entries(data.statementMap)) {
      statementMap[Number(id) + imports.length] = location
      s[Number(id) + imports.length] = data.s[id]
    }
    data.statementMap = statementMap
    data.s = s
    data.meta.lastStatement += imports.length
  }
}
