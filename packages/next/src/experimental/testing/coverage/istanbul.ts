import { assertCoverageCompletion } from '../execution/coverage'
import {
  retainNativeCompilerSourceAuthorization,
  validateNativeCompilerSourceBefore,
  assertBeforeValidatedNativeCompilerSource,
  validateNativeCompilerSourceAfter,
  sealNativeCompilerSourceAuthorization,
  assertSealedNativeCompilerSourceAuthorization,
  retireNativeCompilerSourceAuthorization,
  type SourceNativeInputsAuthorization,
  type RetainedNativeCompilerSource,
} from './source-authorization'
import type { CoverageSourceAuthorization } from './source-analysis'
import type { CompiledCoverageSource, CompilerSourceCoverage } from './types'
import type { CoverageSourcePlan } from './source-analysis-plan'
import type {
  RuntimeConfigurationPlan,
  RuntimeConfigurationReceipt,
} from './runtime-configuration'
import { bindJsxConditionalEnds } from './jsx-boundaries'
import { bindIfReturnEnds } from './if-return-boundaries'
import { bindConditionalOperandEnds } from './conditional-operands'
import { bindParameterPropertyModel } from './parameter-properties'
import { bindNamespaceModel } from './namespaces'
import { bindEnumModel, hasEnumDeclaration } from './enums'
import {
  bindJsxArrowInitializerEnds,
  bindJsxLogicalChildEnds,
  bindJsxReturnEnds,
} from './jsx-owners'
import {
  associateArrowBindings,
  arrowBindingMap,
  bindOriginalArrowLocations,
  bindEmptyParameterDeclarationEnds,
  bindFunctionExpressionCallbackEnds,
  bindClassFunctionExpressionEnds,
} from './arrow-bindings'
import { parse as parseAuthored } from 'next/dist/compiled/babel/parser'
import {
  excludeNativeImportInitializers,
  assertNativeImportExclusion,
} from './import-roles'
import { parse, type Comment } from 'next/dist/compiled/acorn'
import {
  SourceMapGenerator,
  type Mapping,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import { convert } from '../../../compiled/next-test-coverage'
import { join } from 'path'
import { isDeepStrictEqual } from 'util'
import { fileURLToPath, pathToFileURL } from 'url'
import type {
  CompiledTestArtifact,
  TestCoverageCompletion,
  TestEntry,
} from '../contracts'
import {
  assertCompilerRuntimeCoverage,
  retainRuntimeCoverageAuthorization,
  type CoverageRuntimeAuthorization,
  type RuntimeNativeInputsAuthorization,
  retainNativeRuntimeCoverageAuthorization,
  assertNativeCompilerRuntimeCoverage,
  sealNativeRuntimeCoverageAuthorization,
  assertSealedNativeRuntimeCoverageAuthorization,
  retireNativeRuntimeCoverageAuthorization,
} from './runtime-authorization'
import { coverageHash, readArtifactFile } from './artifact'
import { decodeCoverageMap } from './maps'
import { remapCoverage, validateNativeRuntimeLineCoverage } from './remap'
import type {
  CoverageCapture,
  StandardFileCoverage,
  StandardCoverageData,
} from './types'

/** Internal exact-file permission after independent parent authorization. */
interface CompilerSyntax {
  jsxFile?: string
  jsxFiles?: ReadonlySet<string>
  nativeImportFiles?: ReadonlySet<string>
}

/** Each conversion needs fresh nodes because the converter retains traversal state. */
function convertCoverage(options: Parameters<typeof convert>[0]) {
  return convert({ ...options, ast: structuredClone(options.ast) })
}

/** Convert only retained compiler bytes, V8 counts and allowlisted source maps. */
export async function remapStandardCoverage(
  artifact: CompiledTestArtifact,
  capture: CoverageCapture,
  selectSource?: (file: string) => boolean
): Promise<StandardFileCoverage> {
  if (Object.hasOwn(artifact, 'nativeTsConfigInputs'))
    throw new Error(
      'Native TypeScript config inputs require separate parent authorization'
    )
  return remapCompiledStandardCoverage(artifact, capture, selectSource)
}

/** Ordinary Node coverage reuses the current parent source/config selections. */
export async function remapPlannedStandardCoverage(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: {
    runId: string
    entry: TestEntry
    sourcePlan: CoverageSourcePlan
    runtimeConfigurationPlan: RuntimeConfigurationPlan
    runtimeConfigurationReceipt: RuntimeConfigurationReceipt
    assertLease(): void
  },
  signal: AbortSignal,
  selectSource?: (file: string) => boolean
): Promise<StandardFileCoverage> {
  const assertLease = expected.assertLease
  const { assertLease: _lease, ...authorization } = expected
  const retained = structuredClone(authorization)
  const [{ assertCoverageSourcePlan }, configuration, imports] =
    await Promise.all([
      import('./source-analysis-plan.js'),
      import('./runtime-configuration.js'),
      import('./import-roles.js'),
    ])
  const selected = new Set<string>()
  const selectedTypeScriptImports = new Set<string>()
  async function validate() {
    signal.throwIfAborted()
    if (assertLease() !== undefined)
      throw new Error(
        'Planned standard coverage requires a live artifact lease'
      )
    if (!isDeepStrictEqual(authorization, retained))
      throw new Error('Planned standard coverage selection changed')
    assertCoverageCompletion(completion, artifact, retained.runId)
    if (
      !completion.complete ||
      artifact.kind !== 'node' ||
      artifact.entryId !== retained.entry.id ||
      artifact.profile.environment !== 'node' ||
      artifact.profile.runtime !== 'nodejs' ||
      artifact.profile.bundler !== 'turbopack' ||
      !['development', 'production'].includes(artifact.profile.mode) ||
      artifact.profile.route !== undefined ||
      artifact.profile.browserClient !== undefined ||
      !isDeepStrictEqual(artifact.profile, retained.entry.profile) ||
      !isDeepStrictEqual(
        artifact.profile,
        retained.runtimeConfigurationReceipt.authority.profile
      ) ||
      retained.runtimeConfigurationReceipt.compiler.rootDir !==
        artifact.rootDir ||
      retained.runtimeConfigurationReceipt.authority.entry.file !==
        retained.entry.file ||
      retained.runtimeConfigurationReceipt.authority.entry.sha256 !==
        artifact.sourceHash ||
      Object.hasOwn(artifact, 'nativeTsConfigInputs')
    )
      throw new Error('Incompatible planned standard coverage artifact')
    await assertCoverageSourcePlan(retained.sourcePlan, signal)
    await configuration.assertRuntimeConfigurationReceipts({
      receipts: [retained.runtimeConfigurationReceipt],
      facts: [{ entryId: artifact.entryId, revision: artifact.revision }],
      plan: retained.runtimeConfigurationPlan,
      signal,
    })
    await imports.verifyImportCoverageArtifact(artifact)
    const allowed = retained.sourcePlan.requests.filter(
      (request) =>
        isDeepStrictEqual(request.profile, artifact.profile) &&
        /\.[jt]sx$/.test(request.source.file)
    )
    if (!allowed.length)
      allowed.push(
        ...retained.sourcePlan.requests.filter(
          (request) =>
            isDeepStrictEqual(request.profile, artifact.profile) &&
            /\.[cm]?ts$/.test(request.source.file) &&
            !/\.d\.[cm]?ts$/.test(request.source.file)
        )
      )
    if (!allowed.length)
      throw new Error('Missing planned JSX coverage source selection')
    for (const source of Object.values(artifact.coverage!.sources)) {
      if (!source) continue
      const jsx = /\.[jt]sx$/.test(source.file)
      if (
        (!jsx &&
          !allowed.some((request) => request.source.file === source.file)) ||
        (selectSource && !selectSource(source.file))
      )
        continue
      const matching = allowed.filter(
        (request) => request.source.file === source.file
      )
      if (matching.length !== 1 || matching[0].source.sha256 !== source.sha256)
        throw new Error(
          jsx
            ? 'JSX runtime source differs from its parent selection'
            : 'TypeScript runtime source differs from its parent selection'
        )
      if (jsx) selected.add(source.file)
      else selectedTypeScriptImports.add(source.file)
    }
    signal.throwIfAborted()
    if (assertLease() !== undefined)
      throw new Error(
        'Planned standard coverage requires a live artifact lease'
      )
  }
  await validate()
  if (!completion.complete)
    throw new Error('Incomplete planned standard coverage')
  const result = await remapCompiledStandardCoverage(
    artifact,
    completion.data,
    selectSource,
    {
      jsxFiles: selected,
      ...(retained.sourcePlan.requests.some(
        (request) =>
          isDeepStrictEqual(request.profile, artifact.profile) &&
          /\.[jt]sx$/.test(request.source.file)
      )
        ? {}
        : { nativeImportFiles: selectedTypeScriptImports }),
    }
  )
  await validate()
  return result
}

/** Private actual-runtime path; declaration-only artifacts cannot enter here. */
export async function remapCompilerRuntimeCoverage(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: CoverageRuntimeAuthorization,
  signal: AbortSignal
): Promise<StandardFileCoverage> {
  if (Object.hasOwn(artifact, 'nativeTsConfigInputs')) {
    signal.throwIfAborted()
    throw new Error(
      'Native TypeScript config inputs require separate parent authorization'
    )
  }
  const retained = retainRuntimeCoverageAuthorization(
    artifact,
    completion,
    expected,
    signal
  )
  const selected = await assertCompilerRuntimeCoverage(
    retained.artifact,
    retained.completion,
    retained.expected,
    signal
  )
  if (!retained.completion.complete)
    throw new Error('Incomplete runtime coverage')
  const result = await remapCompiledStandardCoverage(
    retained.artifact,
    retained.completion.data,
    (file) => selected.has(file),
    { jsxFiles: selected }
  )
  await assertCompilerRuntimeCoverage(
    retained.artifact,
    retained.completion,
    retained.expected,
    signal
  )
  return result
}

/** Private composition; native origin and runtime JSX remain separate authorities. */
export async function remapCompilerRuntimeCoverageWithNativeTsConfigInputs(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: CoverageRuntimeAuthorization,
  native: RuntimeNativeInputsAuthorization,
  signal: AbortSignal
): Promise<StandardFileCoverage> {
  const retained = await retainNativeRuntimeCoverageAuthorization(
    artifact,
    completion,
    expected,
    native,
    signal
  )
  try {
    const selected = await assertNativeCompilerRuntimeCoverage(
      retained.artifact,
      retained.completion,
      retained.expected,
      signal
    )
    await validateNativeRuntimeLineCoverage(
      retained.artifact,
      retained.completion,
      retained.expected,
      signal
    )
    if (!retained.completion.complete)
      throw new Error('Incomplete runtime coverage')
    const result = await convertCompiledStandardCoverage(
      retained.artifact,
      retained.completion.data,
      (file) => selected.has(file),
      { jsxFiles: selected }
    )
    await assertNativeCompilerRuntimeCoverage(
      retained.artifact,
      retained.completion,
      retained.expected,
      signal
    )
    await sealNativeRuntimeCoverageAuthorization(retained, signal)
    assertSealedNativeRuntimeCoverageAuthorization(retained, signal)
    return result
  } finally {
    retireNativeRuntimeCoverageAuthorization(retained)
  }
}

async function remapCompiledStandardCoverage(
  artifact: CompiledTestArtifact,
  capture: CoverageCapture,
  selectSource?: (file: string) => boolean,
  declarationSyntax?: CompilerSyntax
): Promise<StandardFileCoverage> {
  // The legacy validator also checks every generated/original coordinate, nested
  // V8 range, original source identity/hash and entry capture before conversion.
  await remapCoverage(artifact, capture)
  return convertCompiledStandardCoverage(
    artifact,
    capture,
    selectSource,
    declarationSyntax
  )
}

async function convertCompiledStandardCoverage(
  artifact: CompiledTestArtifact,
  capture: CoverageCapture,
  selectSource?: (file: string) => boolean,
  declarationSyntax?: CompilerSyntax
): Promise<StandardFileCoverage> {
  const files: StandardFileCoverage['files'] = []
  for (const script of capture.scripts) {
    const metadata = artifact.coverage!.scripts.find(
      (item) => item.path === script.path
    )!
    if (artifact.coverage!.browser?.generatedScripts[script.path]) continue
    files.push(
      ...(await convertCompiledScript(
        artifact,
        metadata,
        script.functions,
        selectSource,
        declarationSyntax
      ))
    )
  }

  return {
    version: 1,
    entryId: artifact.entryId,
    revision: artifact.revision,
    complete: true,
    errors: [],
    files,
  }
}

/** Both observed coverage and explicit declaration analysis use the emitted JS AST. */
async function convertCompiledScript(
  artifact: CompiledTestArtifact,
  metadata: NonNullable<CompiledTestArtifact['coverage']>['scripts'][number],
  functions: CoverageCapture['scripts'][number]['functions'],
  selectSource?: (file: string) => boolean,
  declarationSyntax?: CompilerSyntax
): Promise<StandardFileCoverage['files']> {
  const sources = artifact.coverage!.sources
  const files: StandardFileCoverage['files'] = []
  const [bytes, mapBytes] = await Promise.all([
    readArtifactFile(artifact.rootDir, metadata.path),
    readArtifactFile(artifact.rootDir, metadata.mapPath!),
  ])
  // Do not assume the lease protects against changed bytes between reads.
  if (
    coverageHash(bytes) !== metadata.sha256 ||
    coverageHash(mapBytes) !== metadata.mapSha256
  )
    throw new Error(
      `Coverage artifact changed before standard conversion: ${metadata.path}`
    )
  const code = bytes.toString('utf8')
  const rawMap = JSON.parse(mapBytes.toString('utf8'))
  const decoded = decodeCoverageMap(rawMap)
  const map = new SourceMapGenerator()
  const sourceContent = new Map<string, string>()
  for (const mapping of decoded.mappings) {
    const candidate = mapping.source === null ? null : sources[mapping.source]
    const source =
      candidate && (!selectSource || selectSource(candidate.file))
        ? candidate
        : null
    const generated = {
      line: mapping.generatedLine,
      column: mapping.generatedColumn,
    }
    if (source) {
      map.addMapping({
        generated,
        source: source.file,
        original: {
          line: mapping.originalLine!,
          column: mapping.originalColumn!,
        },
      })
    } else {
      // source-map supports an unmapped segment; its 0.6 declarations omit
      // that overload. Keep the boundary instead of mapping excluded code.
      ;(map.addMapping as (mapping: Pick<Mapping, 'generated'>) => void)({
        generated,
      })
    }
  }
  for (const [identity, content] of decoded.sources) {
    const source = sources[identity]
    if (source && (!selectSource || selectSource(source.file))) {
      if (
        typeof content !== 'string' ||
        coverageHash(content) !== source.sha256
      )
        throw new Error(
          `Coverage original source changed before standard conversion: ${identity}`
        )
      map.setSourceContent(source.file, content)
      sourceContent.set(source.file, content)
    }
  }
  const sourceMap = JSON.parse(map.toString()) as RawSourceMap
  if (!sourceMap.sources.length && !artifact.coverage?.importRoles) {
    await excludeNativeImportInitializers({
      artifact,
      code,
      rawMap,
      ast: undefined,
      selectedSources: sourceContent,
      metadata,
    })
    return []
  }
  const comments: Comment[] = []
  const ast = Object.assign(
    parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      onComment: comments,
    }),
    { comments }
  )
  const native = await excludeNativeImportInitializers({
    artifact,
    code,
    rawMap,
    ast,
    selectedSources: declarationSyntax?.nativeImportFiles
      ? new Map(
          [...sourceContent].filter(([file]) =>
            declarationSyntax.nativeImportFiles!.has(file)
          )
        )
      : sourceContent,
    metadata,
  })
  if (!sourceMap.sources.length) return []
  const mapped = await convertCoverage({
    code,
    sourceMap,
    ast: native.ast,
    coverage: {
      url: pathToFileURL(join(artifact.rootDir, metadata.path)).href,
      functions: functions,
    },
  })
  if (native.excluded.length) {
    const unfiltered = await convertCoverage({
      code,
      sourceMap,
      ast,
      coverage: {
        url: pathToFileURL(join(artifact.rootDir, metadata.path)).href,
        functions,
      },
    })
    assertNativeImportExclusion(
      unfiltered as Record<string, StandardCoverageData>,
      mapped as Record<string, StandardCoverageData>,
      native.excluded
    )
  }
  for (const [file, data] of Object.entries(mapped)) {
    if (file !== data.path || !sourceContent.has(file))
      throw new Error(
        `Standard coverage returned an undeclared original source: ${file}`
      )
    const content = sourceContent.get(file)!
    files.push({
      file,
      sha256: coverageHash(content),
      data: await recoverJavaScriptLocations(
        file,
        content,
        data as StandardCoverageData,
        {
          code,
          ast: native.ast,
          mode: artifact.profile.mode,
          sourceMap,
          coverage: {
            url: pathToFileURL(join(artifact.rootDir, metadata.path)).href,
            functions,
          },
        },
        declarationSyntax
      ),
    })
  }
  return files
}

interface NativeSourceZeroScope {
  value: CompiledCoverageSource
  expected: CoverageSourceAuthorization
  signal: AbortSignal
  phase:
    | 'fully-before-validated'
    | 'converting'
    | 'converted'
    | 'post-validated'
    | 'sealing'
    | 'sealed'
}
const nativeSourceZeroScopes = new WeakMap<
  RetainedNativeCompilerSource,
  NativeSourceZeroScope
>()
function sourceZeroScope(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal,
  phase: NativeSourceZeroScope['phase']
): NativeSourceZeroScope {
  const scope = nativeSourceZeroScopes.get(retained)
  if (
    !scope ||
    scope.value !== retained.value ||
    scope.expected !== retained.expected ||
    scope.signal !== signal ||
    scope.phase !== phase
  )
    throw new Error(
      'Missing fully validated private compiler source zero scope'
    )
  signal.throwIfAborted()
  return scope
}
async function convertNativeCompilerSource(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal
): Promise<StandardCoverageData> {
  const scope = sourceZeroScope(retained, signal, 'fully-before-validated')
  assertBeforeValidatedNativeCompilerSource(retained, signal)
  scope.phase = 'converting'
  const file = retained.value.source.file
  const data = await analyzeCompiledSourceDataCore(
    retained.value.artifact,
    file,
    /\.[jt]sx$/.test(file) ? { jsxFile: file } : undefined
  )
  sourceZeroScope(retained, signal, 'converting')
  assertBeforeValidatedNativeCompilerSource(retained, signal)
  scope.phase = 'converted'
  return data
}
/** Private source-only composition; no runtime capture or caller syntax override. */
export async function analyzeCompiledCoverageSourceWithNativeTsConfigInputs(
  value: CompiledCoverageSource,
  expected: CoverageSourceAuthorization,
  native: SourceNativeInputsAuthorization,
  signal: AbortSignal
): Promise<CompilerSourceCoverage> {
  const retained = await retainNativeCompilerSourceAuthorization(
    value,
    expected,
    native,
    signal
  )
  try {
    await validateNativeCompilerSourceBefore(retained, signal)
    assertBeforeValidatedNativeCompilerSource(retained, signal)
    nativeSourceZeroScopes.set(retained, {
      value: retained.value,
      expected: retained.expected,
      signal,
      phase: 'fully-before-validated',
    })
    const data = await convertNativeCompilerSource(retained, signal)
    sourceZeroScope(retained, signal, 'converted')
    await validateNativeCompilerSourceAfter(retained, signal)
    const scope = sourceZeroScope(retained, signal, 'converted')
    scope.phase = 'post-validated'
    const result: CompilerSourceCoverage = {
      version: 1,
      kind: 'next-compiler-declarations',
      source: { ...retained.value.source },
      profile: { ...retained.value.artifact.profile },
      compiler: {
        entryId: retained.value.artifact.entryId,
        revision: retained.value.artifact.revision,
      },
      data,
    }
    scope.phase = 'sealing'
    await sealNativeCompilerSourceAuthorization(retained, signal)
    sourceZeroScope(retained, signal, 'sealing').phase = 'sealed'
    assertSealedNativeCompilerSourceAuthorization(retained, signal)
    return result
  } finally {
    nativeSourceZeroScopes.delete(retained)
    retireNativeCompilerSourceAuthorization(retained)
  }
}

/** Compiler declaration-only analysis; this never constructs a runtime capture. */
export async function analyzeCompiledSourceData(
  artifact: CompiledTestArtifact,
  file: string,
  declarationSyntax?: CompilerSyntax
): Promise<StandardCoverageData> {
  if (Object.hasOwn(artifact, 'nativeTsConfigInputs'))
    throw new Error(
      'Native TypeScript config inputs require separate parent authorization'
    )
  if (
    artifact.coverage?.sourceAnalysis?.version !== 1 ||
    artifact.coverage.sourceAnalysis.file !== file ||
    artifact.coverage.sourceAnalysis.sha256 !== artifact.sourceHash
  )
    throw new Error(
      'Compiler declaration analysis requires its source-analysis role'
    )
  return analyzeCompiledSourceDataCore(artifact, file, declarationSyntax)
}

/** Unexported exact zero algorithm, reached only by its guarded callers. */
async function analyzeCompiledSourceDataCore(
  artifact: CompiledTestArtifact,
  file: string,
  declarationSyntax?: CompilerSyntax
): Promise<StandardCoverageData> {
  const values: StandardCoverageData[] = []
  for (const metadata of artifact.coverage!.scripts) {
    if (!metadata.mapPath) continue
    const bytes = await readArtifactFile(artifact.rootDir, metadata.path)
    if (coverageHash(bytes) !== metadata.sha256)
      throw new Error('Coverage analysis output changed before conversion')
    const code = bytes.toString('utf8')
    // Explicit compile-only zero descriptors, never observed V8 counts.
    const functions = code.length
      ? [
          {
            isBlockCoverage: true,
            ranges: [{ startOffset: 0, endOffset: code.length, count: 0 }],
          },
        ]
      : []
    const files = await convertCompiledScript(
      artifact,
      metadata,
      functions,
      (source) => source === file,
      declarationSyntax
    )
    for (const result of files) {
      if (result.file !== file)
        throw new Error('Coverage analysis returned an unselected source')
      values.push(result.data)
    }
  }
  if (!values.length)
    throw new Error(
      `Selected compiler source has no analyzable mapped declarations: ${file}`
    )
  if (values.some((value) => !isDeepStrictEqual(value, values[0])))
    throw new Error(
      `Coverage source has incompatible duplicate compiler emissions: ${file}`
    )
  const value = values[0]
  if (
    [
      ...Object.values(value.s),
      ...Object.values(value.f),
      ...Object.values(value.b).flat(),
    ].some((count) => count !== 0)
  )
    throw new Error(
      'Compiler declaration analysis cannot contain observed hits'
    )
  return value
}

function identityMap(file: string, source: string) {
  const map = new SourceMapGenerator()
  for (const [index, line] of source.split('\n').entries()) {
    let column = 0
    // The mapper uses these same lexical boundaries for its identity source map.
    for (const token of line.matchAll(/\w+|\s|[^\w\s]/g)) {
      const position = { line: index + 1, column }
      map.addMapping({ generated: position, source: file, original: position })
      column += token[0].length
    }
  }
  map.setSourceContent(file, source)
  return JSON.parse(map.toString()) as RawSourceMap
}

/** Parse authored locations only; never transform or execute the source. */
function authoredAst(
  file: string,
  source: string,
  declarationSyntax?: CompilerSyntax,
  emitted?: { ast: unknown }
) {
  const jsx =
    (declarationSyntax?.jsxFile === file ||
      declarationSyntax?.jsxFiles?.has(file) === true) &&
    /\.[jt]sx$/.test(file)
  if (!/\.[cm]?ts$/.test(file) && !jsx)
    throw new Error(
      `JSX standard coverage requires profile-bound compiler source analysis: ${file}`
    )
  let ast: ReturnType<typeof parseAuthored>
  try {
    ast = parseAuthored(source, {
      sourceType: 'module',
      plugins: [
        'estree',
        ...(/\.[cm]?tsx?$/.test(file) ? ['typescript' as const] : []),
        ...(jsx ? ['jsx' as const] : []),
        'decorators-legacy',
      ],
    })
  } catch (cause) {
    throw new Error(
      `Standard coverage cannot parse the authored TypeScript source: ${file}`,
      { cause }
    )
  }
  const forbidden = new Set([
    'TSImportEqualsDeclaration',
    'TSExportAssignment',
    'Decorator',
  ])
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    const node = value as {
      type?: string
      loc?: { start: { line: number; column: number } }
    }
    if (
      node.type &&
      (forbidden.has(node.type) ||
        ([
          'TSParameterProperty',
          'TSModuleDeclaration',
          'TSEnumDeclaration',
        ].includes(node.type) &&
          !emitted))
    )
      throw new Error(
        `Standard coverage cannot associate generated ${node.type} bodies: ${file}:${node.loc?.start.line}:${node.loc?.start.column}`
      )
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(ast.program)
  return Object.assign(ast.program, { comments: ast.comments })
}

/** Location descriptors only; none of these zero hits may become runtime facts. */
async function createOriginalSourceModel(
  file: string,
  source: string,
  declarationSyntax?: CompilerSyntax,
  emitted?: {
    code: string
    ast: unknown
    sourceMap: RawSourceMap
    data: StandardCoverageData
    coverage: {
      url: string
      functions: CoverageCapture['scripts'][number]['functions']
    }
  }
) {
  if (/\.[cm]?js$/.test(file))
    return {
      data: await createUncoveredJavaScript(file, source),
      ast: undefined,
      observed: undefined,
    }
  const ast = authoredAst(file, source, declarationSyntax, emitted)
  const data = await convertCoverage({
    code: source,
    ast,
    sourceMap: identityMap(file, source),
    coverage: {
      url: pathToFileURL(file).href,
      functions: source.length
        ? [
            {
              isBlockCoverage: true,
              ranges: [{ startOffset: 0, endOffset: source.length, count: 0 }],
            },
          ]
        : [],
    },
  })
  const result = data[file]
  if (!result || result.path !== file || Object.keys(data).length !== 1)
    throw new Error(
      `Authored coverage descriptors returned an unexpected source identity: ${file}`
    )
  const bound = emitted
    ? bindParameterPropertyModel(
        file,
        source,
        ast,
        emitted.ast,
        emitted.sourceMap,
        result as StandardCoverageData,
        emitted.data
      )
    : undefined
  const namespace = emitted
    ? bindNamespaceModel(
        file,
        source,
        ast,
        emitted.ast,
        emitted.sourceMap,
        bound?.original ?? (result as StandardCoverageData),
        bound?.observed ?? emitted.data
      )
    : undefined
  let enumeration: ReturnType<typeof bindEnumModel> | undefined
  if (emitted && hasEnumDeclaration(ast)) {
    // Native lowering may merge source locations, but its actual V8 member
    // counters remain distinct in generated coordinates.
    const generatedFile = fileURLToPath(emitted.coverage.url)
    const converted = await convertCoverage({
      ...emitted,
      sourceMap: identityMap(generatedFile, emitted.code),
    })
    if (Object.keys(converted).length !== 1 || !converted[generatedFile])
      throw new Error(
        'Generated enum coverage returned an unexpected source identity'
      )
    enumeration = bindEnumModel(
      file,
      source,
      ast,
      emitted.ast,
      emitted.sourceMap,
      namespace?.original ??
        bound?.original ??
        (result as StandardCoverageData),
      namespace?.observed ?? bound?.observed ?? emitted.data,
      converted[generatedFile] as StandardCoverageData
    )
  }
  return {
    data:
      enumeration?.original ??
      namespace?.original ??
      bound?.original ??
      (result as StandardCoverageData),
    observed: enumeration?.observed ?? namespace?.observed ?? bound?.observed,
    ast,
  }
}

/** Unexecuted typed sources need metadata from the effective Next compiler context. */
export async function createUncoveredSource(
  file: string,
  source: string
): Promise<StandardCoverageData> {
  if (/\.[cm]?js$/.test(file)) return createUncoveredJavaScript(file, source)
  throw new Error(
    `Unimported TypeScript/JSX coverage requires profile-bound compiler source analysis: ${file}`
  )
}

/** Declaration-only coverage. This never imports or executes the source file. */
export async function createUncoveredJavaScript(
  file: string,
  source: string
): Promise<StandardCoverageData> {
  if (!/\.[cm]?js$/.test(file))
    throw new Error(
      `Standard coverage currently requires a JavaScript source file: ${file}`
    )
  const comments: Comment[] = []
  let ast: ReturnType<typeof parse> & { comments: Comment[] }
  try {
    ast = Object.assign(
      parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        onComment: comments,
      }),
      { comments }
    )
  } catch (cause) {
    throw new Error(
      `Standard coverage currently requires syntax-preserved JavaScript: ${file}`,
      { cause }
    )
  }
  const data = await convertCoverage({
    code: source,
    ast,
    sourceMap: identityMap(file, source),
    coverage: {
      url: pathToFileURL(file).href,
      // This is deliberately uncovered-source metadata, not a runtime V8 capture.
      functions: source.length
        ? [
            {
              isBlockCoverage: true,
              ranges: [{ startOffset: 0, endOffset: source.length, count: 0 }],
            },
          ]
        : [],
    },
  })
  const result = data[file]
  if (!result || result.path !== file || Object.keys(data).length !== 1)
    throw new Error(
      `Uncovered coverage returned an unexpected source identity: ${file}`
    )
  return result as StandardCoverageData
}

/** Restore authored JS locations only after complete one-to-one associations. */
async function recoverJavaScriptLocations(
  file: string,
  source: string,
  data: StandardCoverageData,
  emitted?: {
    code: string
    ast: unknown
    mode: 'development' | 'production'
    sourceMap: RawSourceMap
    coverage: {
      url: string
      functions: CoverageCapture['scripts'][number]['functions']
    }
  },
  declarationSyntax?: CompilerSyntax
): Promise<StandardCoverageData> {
  const model = await createOriginalSourceModel(
    file,
    source,
    declarationSyntax,
    emitted && { ...emitted, data }
  )
  data = model.observed ?? data
  const original = model.data
  if (model.ast) {
    const associations = associateArrowBindings(
      file,
      model.ast,
      emitted?.ast,
      emitted?.sourceMap ?? identityMap(file, source)
    )
    if (associations.length) {
      if (!emitted)
        throw new Error(
          'Arrow binding association requires actual emitted compiler bytes'
        )
      const mapped = await convertCoverage({
        ...emitted,
        sourceMap: arrowBindingMap(file, emitted.sourceMap, associations),
      })
      const rebound = mapped[file] as StandardCoverageData
      if (
        !rebound ||
        !isDeepStrictEqual(
          [data.s, data.f, data.b],
          [rebound.s, rebound.f, rebound.b]
        )
      )
        throw new Error(
          'Arrow binding association changed observed V8 counter identities'
        )
      data = rebound
      bindOriginalArrowLocations(file, original, data, associations)
      bindJsxArrowInitializerEnds(
        file,
        original,
        data,
        associations,
        emitted.sourceMap
      )
    }
    if (emitted) {
      bindJsxReturnEnds(
        file,
        original,
        data,
        model.ast,
        emitted.ast,
        emitted.sourceMap
      )
      bindJsxLogicalChildEnds(
        file,
        data,
        model.ast,
        emitted.ast,
        emitted.sourceMap,
        emitted.mode,
        original
      )
      bindJsxConditionalEnds(
        file,
        data,
        model.ast,
        emitted.ast,
        emitted.sourceMap
      )
      bindFunctionExpressionCallbackEnds(
        file,
        original,
        data,
        model.ast,
        emitted.ast,
        emitted.sourceMap
      )
      bindClassFunctionExpressionEnds(
        file,
        original,
        data,
        model.ast,
        emitted.ast,
        emitted.sourceMap
      )
      bindEmptyParameterDeclarationEnds(
        file,
        original,
        data,
        model.ast,
        emitted.ast,
        emitted.sourceMap
      )
    }
  }
  if (emitted && /\.[cm]?js$/.test(file)) {
    const authored = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    bindIfReturnEnds(
      file,
      original,
      data,
      authored,
      emitted.ast,
      emitted.sourceMap
    )
    bindConditionalOperandEnds(
      file,
      original,
      data,
      authored,
      emitted.ast,
      emitted.sourceMap
    )
  }
  if (Object.keys(original.fnMap).length !== Object.keys(data.fnMap).length)
    throw new Error(
      `Standard coverage generated and original function counts differ: ${file}`
    )
  if (
    Object.keys(original.statementMap).length !==
    Object.keys(data.statementMap).length
  )
    throw new Error(
      `Standard coverage generated and original statement counts differ: ${file}`
    )
  const statements = new Set<string>()
  const statementMap: StandardCoverageData['statementMap'] = {}
  const s: StandardCoverageData['s'] = {}
  for (const [id, location] of Object.entries(original.statementMap)) {
    const candidates = Object.entries(data.statementMap).filter(
      ([, mapped]) =>
        mapped.start.line === location.start.line &&
        mapped.start.column === location.start.column
    )
    if (candidates.length !== 1 || statements.has(candidates[0][0]))
      throw new Error(
        `Standard coverage statement association is ambiguous or absent: ${file}:${location.start.line}:${location.start.column}`
      )
    const [mappedId, mapped] = candidates[0]
    if (mapped.end.line !== location.end.line)
      throw new Error(
        `Standard coverage statement transformation is unsupported: ${file}`
      )
    statements.add(mappedId)
    statementMap[id] = /\.[cm]?js$/.test(file) ? location : mapped
    s[id] = data.s[mappedId]
  }
  const used = new Set<string>()
  const fnMap: StandardCoverageData['fnMap'] = {}
  const f: StandardCoverageData['f'] = {}
  for (const [id, fn] of Object.entries(original.fnMap)) {
    const candidates = Object.entries(data.fnMap).filter(
      ([, mapped]) =>
        mapped.decl.start.line === fn.decl.start.line &&
        mapped.decl.start.column === fn.decl.start.column
    )
    if (candidates.length !== 1 || used.has(candidates[0][0]))
      throw new Error(
        `Standard coverage function association is ambiguous or absent: ${file}:${fn.decl.start.line}:${fn.decl.start.column}`
      )
    const [mappedId, mapped] = candidates[0]
    if (
      mapped.loc.end.line !== fn.loc.end.line ||
      (mapped.name !== fn.name &&
        !(
          mapped.name.startsWith(fn.name + '_') &&
          /^\d+$/.test(mapped.name.slice(fn.name.length + 1))
        ))
    )
      throw new Error(
        `Standard coverage function transformation is unsupported: ${file}`
      )
    used.add(mappedId)
    fnMap[id] = /\.[cm]?js$/.test(file) ? fn : { ...fn, decl: mapped.decl }
    f[id] = data.f[mappedId]
  }
  let branchMap = data.branchMap
  let b = data.b
  if (!/\.[cm]?js$/.test(file)) {
    if (
      Object.keys(original.branchMap).length !==
      Object.keys(data.branchMap).length
    )
      throw new Error(
        `Standard coverage generated and original branch counts differ: ${file}`
      )
    const usedBranches = new Set<string>()
    branchMap = {}
    b = {}
    for (const [id, branch] of Object.entries(original.branchMap)) {
      const candidates = Object.entries(data.branchMap).filter(
        ([, mapped]) =>
          mapped.loc.start.line === branch.loc.start.line &&
          mapped.loc.start.column === branch.loc.start.column
      )
      if (candidates.length !== 1 || usedBranches.has(candidates[0][0]))
        throw new Error(
          `Standard coverage branch association is ambiguous or absent: ${file}:${branch.loc.start.line}:${branch.loc.start.column}`
        )
      const [mappedId, mapped] = candidates[0]
      if (
        mapped.type !== branch.type ||
        mapped.loc.end.line !== branch.loc.end.line ||
        mapped.locations.length !== branch.locations.length ||
        mapped.locations.some(
          (location, index) =>
            location.start.line !== branch.locations[index].start.line ||
            location.start.column !== branch.locations[index].start.column ||
            location.end.line !== branch.locations[index].end.line
        )
      )
        throw new Error(
          `Standard coverage branch transformation is unsupported: ${file}:${branch.loc.start.line}:${branch.loc.start.column}`
        )
      usedBranches.add(mappedId)
      branchMap[id] = mapped
      b[id] = data.b[mappedId]
    }
  }
  const meta = data.meta
  if (meta && original.meta) {
    const seen = Object.fromEntries(
      Object.entries(meta.seen).filter(
        ([key]) =>
          !key.startsWith('f:') &&
          !key.startsWith('s:') &&
          (/\.[cm]?js$/.test(file) || !key.startsWith('b:'))
      )
    )
    for (const [id, fn] of Object.entries(fnMap)) {
      const { start, end } = fn.decl
      seen[`f:${start.line}:${start.column}:${end.line}:${end.column}`] =
        Number(id)
    }
    for (const [id, { start, end }] of Object.entries(statementMap))
      seen[`s:${start.line}:${start.column}:${end.line}:${end.column}`] =
        Number(id)
    if (!/\.[cm]?js$/.test(file))
      for (const [id, branch] of Object.entries(branchMap))
        seen[
          `b:${branch.locations
            .flatMap(({ start, end }) => [
              start.line,
              start.column,
              end.line,
              end.column,
            ])
            .map(String)
            .join(':')}`
        ] = Number(id)
    return {
      ...data,
      statementMap,
      s,
      branchMap,
      b,
      fnMap,
      f,
      meta: {
        ...meta,
        lastStatement: original.meta.lastStatement,
        lastFunction: original.meta.lastFunction,
        fnNames: original.meta.fnNames,
        seen,
      },
    }
  }
  return { ...data, statementMap, s, branchMap, b, fnMap, f }
}
