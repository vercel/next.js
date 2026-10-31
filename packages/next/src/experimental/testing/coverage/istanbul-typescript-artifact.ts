import { parse } from 'next/dist/compiled/babel/parser'
import { readFile, realpath, lstat } from 'fs/promises'
import { isDeepStrictEqual } from 'util'
import { isAbsolute, resolve } from 'path'
import {
  instrumentMappedJavaScript,
  readInitialCoverage,
} from '../../../compiled/next-test-instrumentation'
import { coverageHash, readArtifactFile, within } from './artifact'
import { assertIstanbulProfile } from './istanbul-profile'
import { sourceAnalysisEntryId } from './source-authorization'
import { readIstanbulJsxImportProjection } from './istanbul-jsx-imports'
import { bindIstanbulTypeScriptBodyMappings } from './istanbul-typescript-body-map'
import type { CompiledTestArtifact, TestProfile } from '../contracts'
import type {
  IstanbulInstrumentationMetadata,
  IstanbulRawFileCoverage,
  IstanbulSourceDeclarations,
} from './istanbul-types'

type Node = {
  type: string
  start?: number
  end?: number
  body?: Node[] | Node
  declaration?: Node
  id?: Node
  key?: Node
  value?: unknown
  name?: string
  computed?: boolean
  shorthand?: boolean
  async?: boolean
  generator?: boolean
  params?: Node[]
  directives?: unknown[]
  interpreter?: unknown
  expression?: Node
  callee?: Node
  arguments?: unknown[]
}
function semantic(
  value: unknown,
  project?: (value: unknown) => unknown
): unknown {
  if (Array.isArray(value))
    return value.map((child) => semantic(child, project))
  if (!value || typeof value !== 'object') return value
  const projected = project?.(value)
  if (projected !== undefined) return semantic(projected)
  const node = value as Node
  const result = Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            'loc',
            'start',
            'end',
            'extra',
            'comments',
            'leadingComments',
            'trailingComments',
            'innerComments',
          ].includes(key)
      )
      .map(([key, child]) => [key, semantic(child, project)])
  )
  if (node.type === 'ObjectProperty' && !node.computed && !node.shorthand) {
    if (node.key?.type === 'Identifier')
      result.key = { type: 'StringLiteral', value: node.key.name }
    else if (node.key?.type === 'NumericLiteral')
      result.key = { type: 'StringLiteral', value: String(node.key.value) }
  }
  return result
}
function program(code: string, typed = false, jsx = false): Node {
  return (typed
    ? parse(code, {
        sourceType: 'unambiguous',
        plugins: jsx ? ['typescript', 'jsx'] : ['typescript'],
      })
    : parse(code, {
        sourceType: 'unambiguous',
        ...(jsx ? { plugins: ['jsx' as const] } : {}),
      })
  ).program as unknown as Node
}
function functions(scope: Node): Node[] {
  if (!Array.isArray(scope.body)) return []
  return scope.body.flatMap((node) => {
    if (node.type === 'FunctionDeclaration') return [node]
    if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration'
    )
      return [node.declaration]
    return []
  })
}
function scopes(tree: Node): Node[] {
  const result: Node[] = []
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    const node = value as Node
    if (
      (node.type === 'Program' || node.type === 'BlockStatement') &&
      Array.isArray(node.body)
    )
      result.push(node)
    for (const [key, child] of Object.entries(value))
      if (
        ![
          'loc',
          'comments',
          'tokens',
          'leadingComments',
          'trailingComments',
          'innerComments',
        ].includes(key)
      )
        visit(child)
  }
  visit(tree)
  return result
}
function ownTuple(value: object, keys: string[]) {
  return (
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return !!descriptor && Object.hasOwn(descriptor, 'value')
    })
  )
}
function wireInitial(value: IstanbulRawFileCoverage) {
  const clone = structuredClone(value)
  for (const branch of Object.values(clone.branchMap))
    for (const location of branch.locations)
      for (const position of [location.start, location.end])
        for (const key of ['line', 'column'] as const)
          if (Object.hasOwn(position, key) && position[key] === undefined)
            delete position[key]
  return clone
}

/** Selection only; no compiler, counter or completion fact is issued here. */
export function isIstanbulTypeScriptSource(
  file: string,
  source: string
): boolean {
  if (!/\.(?:ts|mts|[jt]sx)$/.test(file) || /\.d\.(?:ts|mts|tsx)$/.test(file))
    return false
  try {
    const tree = program(source, !file.endsWith('.jsx'), /\.[jt]sx$/.test(file))
    const declarations = functions(tree)
    return !!(
      Array.isArray(tree.body) &&
      !tree.directives?.length &&
      !tree.interpreter &&
      tree.body.every(
        (node) =>
          node.type === 'TSTypeAliasDeclaration' ||
          (node.type === 'ExportNamedDeclaration' &&
            ['FunctionDeclaration', 'TSTypeAliasDeclaration'].includes(
              node.declaration?.type ?? ''
            ))
      ) &&
      declarations.length &&
      declarations.every(
        (node) =>
          node.id?.type === 'Identifier' &&
          typeof node.id.name === 'string' &&
          !node.async &&
          !node.generator &&
          Array.isArray(node.params) &&
          node.params.every((parameter) => parameter.type === 'Identifier') &&
          node.body &&
          !Array.isArray(node.body) &&
          node.body.type === 'BlockStatement' &&
          Array.isArray(node.body.body) &&
          node.body.body.length
      )
    )
  } catch {
    return false
  }
}

/** Reproduce declarations, never claim a serialized tuple is compiler authority. */
export async function regenerateIstanbulTypeScriptSource(
  source: IstanbulInstrumentationMetadata['sources'][number],
  projectDir: string,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  const root = await realpath(projectDir)
  const typed = source.typeScriptSource
  if (
    !isAbsolute(source.file) ||
    resolve(source.file) !== source.file ||
    !within(root, source.file) ||
    (await realpath(source.file)) !== source.file ||
    !(await lstat(source.file)).isFile() ||
    !typed ||
    !ownTuple(typed, ['version', 'code', 'inputSourceMap']) ||
    typed.version !== 1 ||
    typeof typed.code !== 'string'
  )
    throw new Error('Invalid actual typed Istanbul source tuple.')
  const authoredSource = await readFile(source.file, 'utf8')
  if (
    coverageHash(authoredSource) !== source.sha256 ||
    !isIstanbulTypeScriptSource(source.file, authoredSource)
  )
    throw new Error('Typed Istanbul source changed or has unsupported syntax.')
  const generated = instrumentMappedJavaScript(
    typed.code,
    source.file,
    typed.inputSourceMap
  )
  if (
    !isDeepStrictEqual(
      wireInitial(generated.initial),
      wireInitial(source.initial)
    )
  )
    throw new Error(
      'Typed Istanbul declarations differ from their actual instrumenter.'
    )
  const associated = bindIstanbulTypeScriptBodyMappings({
    file: source.file,
    authoredSource,
    emittedSource: typed.code,
    rawCoverage: generated.initial,
  })
  if (!associated)
    throw new Error(
      'Typed Istanbul compiler source-map roles are incomplete or ambiguous.'
    )
  const tree = program(generated.code)
  const expectedFunctions = functions(tree)
  const literal = readInitialCoverage(generated.code)
  if (
    !literal ||
    literal.path !== source.file ||
    literal.gcv !== '__VITEST_COVERAGE__' ||
    !isDeepStrictEqual(
      wireInitial(literal.coverageData),
      wireInitial(source.initial)
    )
  )
    throw new Error('Typed Istanbul actual instrumenter template is absent.')
  const coverageFunctions = expectedFunctions.filter((node) => {
    if (typeof node.start !== 'number' || typeof node.end !== 'number')
      return false
    const candidate = readInitialCoverage(
      generated.code.slice(node.start, node.end)
    )
    return candidate?.path === source.file
  })
  if (coverageFunctions.length !== 1 || !coverageFunctions[0].id?.name)
    throw new Error(
      'Typed Istanbul instrumenter template has ambiguous ownership.'
    )
  signal.throwIfAborted()
  return {
    generated,
    associated,
    literal,
    expectedFunctions,
    coverageFunction: coverageFunctions[0],
  }
}

/** Bind only real leased script/template/counter scopes to the regenerated tuple. */
export async function readIstanbulTypeScriptDeclarations({
  artifact,
  source,
  projectDir,
  profile,
  owner,
  signal,
  assertLease,
}: {
  artifact: CompiledTestArtifact
  source: IstanbulInstrumentationMetadata['sources'][number]
  projectDir: string
  profile: TestProfile
  owner: IstanbulSourceDeclarations['owner']
  signal: AbortSignal
  assertLease?: () => void
}): Promise<IstanbulSourceDeclarations> {
  const lease = () => {
    signal.throwIfAborted()
    assertLease?.()
  }
  lease()
  assertIstanbulProfile(profile)
  if (profile.mode !== 'development')
    throw new Error(
      'Typed Istanbul requires its qualified development profile.'
    )
  const declared = artifact.coverage?.istanbul?.sources.filter(
    (value) => value.file === source.file
  )
  if (
    artifact.kind !== 'node' ||
    artifact.version !== 2 ||
    !isDeepStrictEqual(artifact.profile, profile) ||
    artifact.coverage?.version !== 1 ||
    !declared ||
    declared.length !== 1 ||
    !isDeepStrictEqual(declared[0], source) ||
    artifact.moduleMocking ||
    artifact.moduleCache ||
    artifact.dynamicModuleMocking ||
    artifact.cohort ||
    artifact.coverage.sourcePreservation ||
    (artifact.coverage.importRoles !== undefined &&
      !artifact.coverage.istanbul!.sources.some((candidate) =>
        /\.[jt]sx$/.test(candidate.file)
      )) ||
    artifact.coverage.browser ||
    (owner.kind === 'runtime-entry'
      ? artifact.coverage.sourceAnalysis !== undefined ||
        owner.entryId !== artifact.entryId ||
        owner.revision !== artifact.revision
      : !isDeepStrictEqual(artifact.coverage.sourceAnalysis, {
          version: 1,
          file: source.file,
          sha256: source.sha256,
        }) ||
        artifact.entryId !== sourceAnalysisEntryId(profile, source.file) ||
        owner.revision !== artifact.revision)
  )
    throw new Error(
      'Typed Istanbul declarations lack their actual artifact owner.'
    )
  const rebuilt = await regenerateIstanbulTypeScriptSource(
    source,
    projectDir,
    signal
  )
  const expectedName = rebuilt.coverageFunction.id!.name!
  let matches = 0
  for (const script of artifact.coverage.scripts) {
    lease()
    if (!artifact.files.includes(script.path))
      throw new Error('Typed Istanbul script is outside its leased inventory.')
    const code = (
      await readArtifactFile(artifact.rootDir, script.path)
    ).toString('utf8')
    if (coverageHash(code) !== script.sha256)
      throw new Error('Typed Istanbul emitted script changed.')
    let rawMap: unknown
    if (script.mapPath) {
      if (
        !artifact.files.includes(script.mapPath) ||
        coverageHash(
          await readArtifactFile(artifact.rootDir, script.mapPath)
        ) !== script.mapSha256
      )
        throw new Error('Typed Istanbul emitted source map changed.')
      rawMap = JSON.parse(
        (await readArtifactFile(artifact.rootDir, script.mapPath)).toString(
          'utf8'
        )
      )
    }
    if (!code.includes('_coverageSchema')) continue
    const tree = program(code)
    for (const scope of scopes(tree)) {
      const actualFunctions = functions(scope)
      for (const candidate of actualFunctions) {
        if (
          typeof candidate.start !== 'number' ||
          typeof candidate.end !== 'number'
        )
          continue
        const literal = readInitialCoverage(
          code.slice(candidate.start, candidate.end)
        )
        if (literal?.path !== source.file) continue
        if (
          literal.hash !== rebuilt.literal.hash ||
          literal.gcv !== rebuilt.literal.gcv ||
          !isDeepStrictEqual(
            wireInitial(literal.coverageData),
            wireInitial(source.initial)
          ) ||
          candidate.id?.name !== expectedName ||
          !isDeepStrictEqual(
            semantic(candidate),
            semantic(rebuilt.coverageFunction)
          ) ||
          actualFunctions.length !== rebuilt.expectedFunctions.length
        )
          throw new Error(
            'Typed Istanbul emitted template does not match its actual producer.'
          )
        const project = /\.[jt]sx$/.test(source.file)
          ? await readIstanbulJsxImportProjection({
              artifact,
              source,
              generated: rebuilt.generated,
              metadata: script,
              code,
              rawMap,
              tree,
              scope,
            })
          : undefined
        const available = new Set(actualFunctions)
        for (const expected of rebuilt.expectedFunctions) {
          const actual = actualFunctions.filter(
            (node) =>
              node.id?.name === expected.id?.name &&
              isDeepStrictEqual(semantic(node, project), semantic(expected))
          )
          if (actual.length !== 1 || !available.delete(actual[0]))
            throw new Error(
              'Typed Istanbul counter function has foreign or duplicate scope ownership.'
            )
        }
        const calls = (scope.body as Node[]).filter(
          (node) =>
            node.type === 'ExpressionStatement' &&
            node.expression?.type === 'CallExpression' &&
            node.expression.callee?.type === 'Identifier' &&
            node.expression.callee.name === expectedName &&
            node.expression.arguments?.length === 0
        )
        if (available.size || calls.length !== 1)
          throw new Error(
            'Typed Istanbul emitted counter initialization is incomplete.'
          )
        matches++
      }
    }
  }
  if (matches !== 1)
    throw new Error(
      'Typed Istanbul emitted declaration scope is missing or ambiguous.'
    )
  lease()
  if (coverageHash(await readFile(source.file)) !== source.sha256)
    throw new Error('Typed Istanbul source changed during artifact validation.')
  return {
    version: 1,
    profile: { ...profile },
    owner: { ...owner },
    source: { file: source.file, sha256: source.sha256 },
    typeScriptSource: structuredClone(source.typeScriptSource!),
    initial: structuredClone(source.initial),
  }
}
