import { parse } from 'next/dist/compiled/babel/parser'
import { isDeepStrictEqual } from 'util'
import { coverageHash, readArtifactFile } from './artifact'
import { decodeCoverageMap } from './maps'
import type { CompiledTestArtifact } from '../contracts'
import type { CoverageArtifactMetadata, StandardCoverageData } from './types'

type Point = { line: number; column: number }
type Node = { type: string; start: number; end: number; [key: string]: any }
type Excluded = { file: string; start: Point }
const fail = (): never => {
  throw new Error('Invalid native import coverage ownership')
}
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0
const exactKeys = (value: any, keys: string[]) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))
const point = (value: any): value is Point =>
  exactKeys(value, ['line', 'column']) &&
  integer(value.line) &&
  integer(value.column)
const same = (a: Point, b: Point) => a.line === b.line && a.column === b.column
const compare = (a: Point, b: Point) => a.line - b.line || a.column - b.column
const add = (offset: Point, value: Point): Point => ({
  line: offset.line + value.line,
  column: value.column + (value.line === 0 ? offset.column : 0),
})

/** The only authority is an opted-in native endpoint's hash-bound sidecar. */
async function readNativeInventory(
  rootDir: string,
  entryPath: string,
  files: readonly string[],
  mode: string
) {
  if (!['development', 'production'].includes(mode)) fail()
  const path = entryPath.replace(/\.js$/, '.import-coverage.json')
  if (path === entryPath || !files.includes(path)) fail()
  const bytes = await readArtifactFile(rootDir, path)
  const data = JSON.parse(bytes.toString('utf8'))
  if (
    !exactKeys(data, ['version', 'kind', 'mode', 'entryPath', 'scripts']) ||
    data.version !== 1 ||
    data.kind !== 'native-import-initializer-coverage' ||
    data.mode !== mode ||
    data.entryPath !== entryPath ||
    !Array.isArray(data.scripts)
  )
    fail()
  const seen = new Set<string>()
  for (const script of data.scripts) {
    if (
      !exactKeys(script, [
        'path',
        'sha256',
        'mapPath',
        'mapSha256',
        'sections',
      ]) ||
      typeof script.path !== 'string' ||
      !script.path.endsWith('.js') ||
      script.mapPath !== script.path + '.map' ||
      !/^[a-f0-9]{64}$/.test(script.sha256) ||
      !/^[a-f0-9]{64}$/.test(script.mapSha256) ||
      !Array.isArray(script.sections) ||
      !script.sections.length ||
      !files.includes(script.path) ||
      !files.includes(script.mapPath) ||
      seen.has(script.path)
    )
      fail()
    seen.add(script.path)
    const [code, map] = await Promise.all([
      readArtifactFile(rootDir, script.path),
      readArtifactFile(rootDir, script.mapPath),
    ])
    if (
      coverageHash(code) !== script.sha256 ||
      coverageHash(map) !== script.mapSha256
    )
      fail()
  }
  return {
    data,
    proof: {
      version: 1 as const,
      nativeMetadata: { path, sha256: coverageHash(bytes) },
    },
  }
}

/** Independent private-native proof; requesting a role never grants JSX admission. */
export async function readImportCoverageProof(
  rootDir: string,
  entryPath: string,
  files: readonly string[],
  mode: string
): Promise<NonNullable<CoverageArtifactMetadata['importRoles']>> {
  return (await readNativeInventory(rootDir, entryPath, files, mode)).proof
}

function walk(
  value: unknown,
  visit: (node: Node, parents: Node[]) => void,
  parents: Node[] = []
): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parents)
    return
  }
  const node = value as Node
  const next = typeof node.type === 'string' ? [...parents, node] : parents
  if (typeof node.type === 'string') visit(node, parents)
  for (const [key, child] of Object.entries(value))
    if (!['loc', 'comments', 'tokens'].includes(key)) walk(child, visit, next)
}

/** Revalidate the actual native sidecar and its complete script inventory. */
async function verifiedNativeImportInventory(artifact: CompiledTestArtifact) {
  const proof = artifact.coverage?.importRoles
  if (
    !proof ||
    !exactKeys(proof, ['version', 'nativeMetadata']) ||
    proof.version !== 1 ||
    artifact.version !== 2 ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.runtime !== 'nodejs' ||
    artifact.profile.bundler !== 'turbopack' ||
    artifact.profile.browserClient ||
    artifact.profile.route !== undefined
  )
    fail()
  const expected = await readNativeInventory(
    artifact.rootDir,
    artifact.entryPath,
    artifact.files,
    artifact.profile.mode
  )
  if (!isDeepStrictEqual(expected.proof, proof)) fail()
  for (const script of expected.data.scripts) {
    const matches = artifact.coverage!.scripts.filter(
      (value) => value.path === script.path
    )
    if (
      matches.length !== 1 ||
      !isDeepStrictEqual(matches[0], {
        path: script.path,
        sha256: script.sha256,
        mapPath: script.mapPath,
        mapSha256: script.mapSha256,
      })
    )
      fail()
  }
  return expected
}

/** Parent declaration analysis validates this before excluding proof metadata. */
export async function verifyImportCoverageArtifact(
  artifact: CompiledTestArtifact
): Promise<void> {
  if (
    artifact.entryPath !==
    `server/next-test/${coverageHash(artifact.entryId)}.js`
  )
    fail()
  await verifiedNativeImportInventory(artifact)
}

/** Preserve the actual compiler AST unless independently certified native nodes qualify. */
export async function excludeNativeImportInitializers(options: {
  artifact: CompiledTestArtifact
  code: string
  rawMap: unknown
  ast: unknown
  selectedSources: ReadonlyMap<string, string>
  metadata: CoverageArtifactMetadata['scripts'][number]
}): Promise<{ ast: unknown; excluded: Excluded[] }> {
  const { artifact, code, rawMap, selectedSources, metadata } = options
  const proof = artifact.coverage?.importRoles
  // Vendor x_* fields, whether flat or nested, are never inspected for authority.
  if (!proof) return { ast: options.ast, excluded: [] }
  const expected = await verifiedNativeImportInventory(artifact)
  const owned = expected.data.scripts.filter(
    (script: any) => script.path === metadata.path
  )
  if (owned.length > 1) fail()
  if (!owned.length) return { ast: options.ast, excluded: [] }
  const starts = [0],
    ends: number[] = []
  for (const match of code.matchAll(/\r\n|[\n\r\u2028\u2029]/g)) {
    ends.push(match.index!)
    starts.push(match.index! + match[0].length)
  }
  ends.push(code.length)
  function offset(value: Point): number {
    if (!point(value) || value.line >= starts.length) fail()
    const end = ends[value.line]
    const result = starts[value.line] + value.column
    if (result > end || result > code.length) fail()
    return result
  }
  const roles: {
    role: any
    start: number
    end: number
    moduleStart: number
    moduleEnd: number
  }[] = []
  for (const section of owned[0].sections) {
    if (!exactKeys(section, ['offset', 'data']) || !point(section.offset))
      fail()
    const origin: Point = section.offset,
      data = section.data
    if (
      !exactKeys(data, ['version', 'moduleEnd', 'roles']) ||
      data.version !== 1 ||
      !point(data.moduleEnd) ||
      !Array.isArray(data.roles) ||
      !data.roles.length
    )
      fail()
    const moduleStart = offset(origin),
      moduleEnd = offset(add(origin, data.moduleEnd))
    if (moduleEnd <= moduleStart) fail()
    let previous = moduleStart
    for (const role of data.roles) {
      if (
        !exactKeys(role, [
          'kind',
          'start',
          'end',
          'binding',
          'context',
          'target',
          'source',
        ]) ||
        role.kind !== 'esm-import-initializer' ||
        !point(role.start) ||
        !point(role.end) ||
        compare(role.start, role.end) >= 0 ||
        !exactKeys(role.source, ['start', 'end']) ||
        !point(role.source.start) ||
        !point(role.source.end) ||
        role.source.start.line < 1 ||
        compare(role.source.start, role.source.end) >= 0 ||
        typeof role.binding !== 'string' ||
        !role.binding ||
        typeof role.context !== 'string' ||
        !role.context ||
        !exactKeys(role.target, ['kind', 'value']) ||
        (role.target.kind === 'string'
          ? typeof role.target.value !== 'string'
          : role.target.kind !== 'number' || !integer(role.target.value))
      )
        fail()
      const start = offset(add(origin, role.start)),
        end = offset(add(origin, role.end))
      if (start < previous || end > moduleEnd) fail()
      previous = end
      roles.push({ role, start, end, moduleStart, moduleEnd })
    }
  }
  if (!roles.length) return { ast: options.ast, excluded: [] }
  roles.sort((a, b) => a.start - b.start)
  if (
    roles.some((role, index) => index > 0 && roles[index - 1].end > role.start)
  )
    fail()
  const decoded = decodeCoverageMap(rawMap),
    nodes: { node: Node; parents: Node[] }[] = []
  walk(options.ast, (node, parents) => {
    if (node.type === 'VariableDeclaration') nodes.push({ node, parents })
  })
  const excluded: Excluded[] = [],
    remove = new Set<number>(),
    authored = new Map<string, Node[]>()
  for (const { role, start, end, moduleStart, moduleEnd } of roles) {
    const matches = nodes.filter(
      (value) => value.node.start === start && value.node.end === end
    )
    if (matches.length !== 1) fail()
    const { node, parents } = matches[0],
      parent = parents[parents.length - 1],
      factory = parents[parents.length - 2],
      container = parents[parents.length - 3]
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
    const factoryIndex = container.elements.indexOf(factory),
      moduleId = container.elements[factoryIndex - 1]
    if (
      factoryIndex < 1 ||
      moduleId?.type !== 'Literal' ||
      !['string', 'number'].includes(typeof moduleId.value)
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
    // Native context ownership must remain the actual factory parameter binding.
    function binds(pattern: any): boolean {
      if (!pattern) return false
      if (pattern.type === 'Identifier') return pattern.name === role.context
      if (pattern.type === 'RestElement') return binds(pattern.argument)
      if (pattern.type === 'AssignmentPattern') return binds(pattern.left)
      if (pattern.type === 'ArrayPattern') return pattern.elements.some(binds)
      if (pattern.type === 'ObjectPattern')
        return pattern.properties.some((property: any) =>
          binds(
            property.type === 'RestElement' ? property.argument : property.value
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
      for (const [key, child] of Object.entries(value))
        if (!['loc', 'comments', 'tokens'].includes(key)) checkScope(child)
    }
    checkScope(parent)
    const generatedPoint = node.loc.start
    const exact = decoded.mappings.filter(
      (mapping) =>
        mapping.generatedLine === generatedPoint.line &&
        mapping.generatedColumn === generatedPoint.column
    )
    if (exact.length !== 1 || exact[0].source === null) fail()
    const identity = exact[0].source!
    const source = artifact.coverage!.sources[identity]
    if (!source || !selectedSources.has(source.file)) continue
    const content = selectedSources.get(source.file)!
    if (coverageHash(content) !== source.sha256) fail()
    if (!authored.has(source.file)) {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: [
          'estree',
          ...(/\.[cm]?tsx?$/.test(source.file) ? ['typescript' as const] : []),
          ...(/\.[jt]sx$/.test(source.file) ? ['jsx' as const] : []),
        ],
      })
      authored.set(
        source.file,
        (ast.program.body as unknown as Node[]).filter(
          (value) => value.type === 'ImportDeclaration'
        )
      )
    }
    const imports = authored
      .get(source.file)!
      .filter(
        (value) =>
          same(value.loc.start, role.source.start) &&
          same(value.loc.end, role.source.end) &&
          value.loc.start.line === exact[0].originalLine &&
          value.loc.start.column === exact[0].originalColumn
      )
    if (imports.length !== 1) fail()
    for (const mapping of decoded.mappings) {
      const position = {
        line: mapping.generatedLine - 1,
        column: mapping.generatedColumn,
      }
      const at = offset(position)
      if (at < start || at >= end || mapping.source === null) continue
      if (
        mapping.source !== exact[0].source ||
        compare(
          { line: mapping.originalLine!, column: mapping.originalColumn! },
          imports[0].loc.start
        ) < 0 ||
        compare(
          { line: mapping.originalLine!, column: mapping.originalColumn! },
          imports[0].loc.end
        ) >= 0
      )
        fail()
    }
    excluded.push({ file: source.file, start: imports[0].loc.start })
    remove.add(start)
  }
  if (!remove.size) return { ast: options.ast, excluded }
  const ast = structuredClone(options.ast)
  walk(ast, (node) => {
    if (node.type === 'BlockStatement')
      node.body = node.body.filter((item: Node) => !remove.has(item.start))
  })
  return { ast, excluded }
}

/** Dropping a native descriptor cannot alter any remaining real V8 fact. */
export function assertNativeImportExclusion(
  before: Record<string, StandardCoverageData>,
  after: Record<string, StandardCoverageData>,
  excluded: Excluded[]
): void {
  if (!isDeepStrictEqual(Object.keys(before).sort(), Object.keys(after).sort()))
    fail()
  for (const [file, data] of Object.entries(before)) {
    const result = after[file],
      removed = new Set<string>()
    for (const role of excluded.filter((value) => value.file === file)) {
      const ids = Object.entries(data.statementMap).filter(([, location]) =>
        same(location.start, role.start)
      )
      if (ids.length !== 1 || removed.has(ids[0][0])) fail()
      removed.add(ids[0][0])
    }
    if (
      !isDeepStrictEqual(
        [data.fnMap, data.f, data.branchMap, data.b],
        [result.fnMap, result.f, result.branchMap, result.b]
      )
    )
      fail()
    if (data.meta === undefined || result.meta === undefined) {
      if (!isDeepStrictEqual(data.meta, result.meta)) fail()
    } else {
      if (
        !data.meta ||
        !result.meta ||
        !data.meta.seen ||
        typeof data.meta.seen !== 'object' ||
        Array.isArray(data.meta.seen)
      )
        fail()
      const ids = Object.keys(data.statementMap)
      if (
        data.meta.lastStatement !== ids.length ||
        ids.some((id, index) => id !== String(index))
      )
        fail()
      const seen = Object.assign(
          Object.create(Object.getPrototypeOf(data.meta.seen)),
          data.meta.seen
        ),
        statementMap: StandardCoverageData['statementMap'] = {},
        counts: StandardCoverageData['s'] = {},
        keys = new Set<string>()
      let index = 0
      for (const id of ids) {
        const location = data.statementMap[id]
        const key = `s:${location.start.line}:${location.start.column}:${location.end.line}:${location.end.column}`
        if (!Object.hasOwn(seen, key) || seen[key] !== Number(id)) fail()
        keys.add(key)
        if (removed.has(id)) delete seen[key]
        else {
          seen[key] = index
          statementMap[index] = location
          // Keep the genuine counter; only descriptor identifiers are reindexed.
          counts[index] = data.s[id]
          index++
        }
      }
      if (
        Object.keys(data.meta.seen).some(
          (key) => key.startsWith('s:') && !keys.has(key)
        ) ||
        !isDeepStrictEqual(
          [statementMap, counts, { ...data.meta, lastStatement: index, seen }],
          [result.statementMap, result.s, result.meta]
        )
      )
        fail()
    }
    const statements = (value: StandardCoverageData, omit: Set<string>) =>
      Object.entries(value.statementMap)
        .filter(([id]) => !omit.has(id))
        .map(([id, loc]) => ({ location: loc, count: value.s[id] }))
        .sort((a, b) =>
          [
            a.location.start.line,
            a.location.start.column,
            a.location.end.line,
            a.location.end.column,
          ]
            .join(':')
            .localeCompare(
              [
                b.location.start.line,
                b.location.start.column,
                b.location.end.line,
                b.location.end.column,
              ].join(':')
            )
        )
    if (
      !isDeepStrictEqual(
        statements(data, removed),
        statements(result, new Set())
      )
    )
      fail()
  }
}
