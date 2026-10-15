import { createHash, randomUUID } from 'crypto'
import { readFile, realpath } from 'fs/promises'
import type { DiscoveredTestProject } from './discovery'
import type {
  CaseResult,
  SerializedDiagnostic,
  SuiteResult,
} from './reporting/events'
import { runTestProcess } from './execution/process'

/** The one-shot tsc contract. Compiler build/watch modes have separate owners. */
export interface TestTypecheckConfig {
  enabled: boolean
  only: boolean
  include: string[]
  exclude: string[]
  allowJs: boolean
  ignoreSourceErrors: boolean
  tsconfig?: string
}

export function parseTestTypecheckConfig(
  value: unknown,
  label: string
): TestTypecheckConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`)
  const config = value as Record<string, unknown>
  for (const key of Object.keys(config)) {
    if (key === 'checker' && config[key] === 'tsc') continue
    if (key === 'build' && config[key] === false) continue
    if (
      ![
        'enabled',
        'only',
        'include',
        'exclude',
        'allowJs',
        'ignoreSourceErrors',
        'tsconfig',
      ].includes(key)
    )
      throw new Error(
        `Unsupported ${label}.${key}: type-test checking currently supports one-shot tsc without build mode.`
      )
  }
  for (const key of ['enabled', 'only', 'allowJs', 'ignoreSourceErrors']) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean')
      throw new Error(`${label}.${key} must be a boolean.`)
  }
  const patterns = (key: 'include' | 'exclude', fallback: string[]) => {
    const selected = config[key] ?? fallback
    if (
      !Array.isArray(selected) ||
      selected.some((item) => typeof item !== 'string' || !item.trim())
    )
      throw new Error(`${label}.${key} must be an array of nonempty strings.`)
    return selected as string[]
  }
  if (
    config.tsconfig !== undefined &&
    (typeof config.tsconfig !== 'string' || !config.tsconfig.trim())
  )
    throw new Error(`${label}.tsconfig must be a nonempty path.`)
  return {
    enabled:
      config.enabled === true ||
      (config.enabled === undefined && config.only === true),
    only: config.only === true,
    include: patterns('include', ['**/*.{test,spec}-d.?(c|m)[jt]s?(x)']),
    exclude: patterns('exclude', ['**/node_modules/**', '**/.git/**']),
    allowJs: config.allowJs === true,
    ignoreSourceErrors: config.ignoreSourceErrors === true,
    ...(config.tsconfig === undefined
      ? {}
      : { tsconfig: config.tsconfig as string }),
  }
}

export interface TypecheckFileResult {
  entryId: string
  revision: string
  status: 'passed' | 'failed'
  durationMs: number
  cases: CaseResult[]
  suites: SuiteResult[]
  errors: SerializedDiagnostic[]
}
export interface TypecheckCompletion {
  files: TypecheckFileResult[]
  sourceErrors: SerializedDiagnostic[]
}
export interface TypecheckRequest {
  id: string
  projectDir: string
  project: DiscoveredTestProject
  testNamePattern?: string | RegExp
}

function diagnostic(value: unknown): value is SerializedDiagnostic {
  if (!value || typeof value !== 'object') return false
  const error = value as SerializedDiagnostic
  return (
    typeof error.message === 'string' &&
    error.severity === 'error' &&
    error.phase === 'compilation' &&
    error.name === 'TypeCheckError' &&
    (error.location === undefined ||
      (typeof error.location.file === 'string' &&
        Number.isSafeInteger(error.location.line) &&
        error.location.line! > 0 &&
        Number.isSafeInteger(error.location.column) &&
        error.location.column! > 0))
  )
}

/** Validate producer identity before provisional compiler facts reach reporters. */
export function assertTypecheckCompletion(
  value: unknown,
  project: DiscoveredTestProject
): asserts value is TypecheckCompletion {
  const completion = value as TypecheckCompletion | undefined
  const entries = project.entries.filter((entry) => entry.typecheck)
  if (
    !completion ||
    !Array.isArray(completion.files) ||
    !Array.isArray(completion.sourceErrors) ||
    !completion.sourceErrors.every(diagnostic) ||
    completion.files.length !== entries.length
  )
    throw new Error('Invalid typecheck completion.')
  const seen = new Set<string>()
  for (const file of completion.files) {
    const entry = entries.find((candidate) => candidate.id === file?.entryId)
    if (
      !entry ||
      seen.has(file.entryId) ||
      !/^[a-f0-9]{64}$/.test(file.revision) ||
      !['passed', 'failed'].includes(file.status) ||
      !Number.isFinite(file.durationMs) ||
      file.durationMs < 0 ||
      !Array.isArray(file.cases) ||
      !Array.isArray(file.suites) ||
      !Array.isArray(file.errors) ||
      !file.errors.every(diagnostic)
    )
      throw new Error('Invalid typecheck file completion.')
    seen.add(file.entryId)
    const tasks = new Set<string>()
    for (const task of [...file.cases, ...file.suites]) {
      const id = 'caseId' in task ? task.caseId : task.suiteId
      if (
        task.entryId !== file.entryId ||
        typeof id !== 'string' ||
        (!id.startsWith(`${file.entryId}/`) &&
          !('suiteId' in task && id === file.entryId)) ||
        tasks.has(id) ||
        typeof task.name !== 'string' ||
        !Array.isArray(task.ancestors) ||
        !task.ancestors.every(
          (ancestor) =>
            typeof ancestor.id === 'string' && typeof ancestor.name === 'string'
        ) ||
        !['passed', 'failed', 'skipped'].includes(task.status) ||
        !Number.isFinite(task.durationMs) ||
        task.durationMs !== 0 ||
        !Array.isArray(task.errors) ||
        !task.errors.every(diagnostic)
      )
        throw new Error('Invalid typecheck task completion.')
      tasks.add(id)
      if (
        'caseId' in task &&
        (task.revision !== file.revision ||
          task.attempt?.id !== `${id}:typecheck` ||
          task.attempt.retry !== 0 ||
          task.attempt.repeat !== 0 ||
          !['run', 'skip', 'todo'].includes(task.mode ?? '') ||
          typeof task.testName !== 'string' ||
          task.location?.file !== entry.file)
      )
        throw new Error('Invalid typecheck case identity.')
    }
    if (
      file.status === 'passed' &&
      (file.errors.length ||
        file.cases.some((test) => test.status === 'failed') ||
        file.suites.some((suite) => suite.status === 'failed'))
    )
      throw new Error('Typecheck completion suppressed a failure.')
  }
}

/** Parent timers and process-group cleanup bound synchronous compiler work. */
export async function runTypecheckProject(
  projectDir: string,
  project: DiscoveredTestProject,
  options: { signal: AbortSignal; testNamePattern?: string | RegExp }
): Promise<TypecheckCompletion> {
  options.signal.throwIfAborted()
  const selectedSources = new Map(
    await Promise.all(
      project.entries
        .filter((entry) => entry.typecheck)
        .map(async (entry) => [entry.id, await realpath(entry.file)] as const)
    )
  )
  const request: TypecheckRequest = {
    id: randomUUID(),
    projectDir: await realpath(projectDir),
    project,
    testNamePattern: options.testNamePattern,
  }
  let completion: TypecheckCompletion | undefined
  let failure: string | undefined
  let received = false
  const exited = await runTestProcess(require.resolve('./typecheck-worker'), {
    cwd: projectDir,
    env: process.env,
    input: request,
    signal: options.signal,
    timeoutMs: project.fileTimeout,
    onMessage(message) {
      const response = message as {
        type?: string
        id?: string
        value?: unknown
        error?: string
      }
      if (
        !response ||
        response.id !== request.id ||
        response.type !== 'typecheck-complete' ||
        received
      )
        throw new Error('Invalid or duplicate typecheck response.')
      received = true
      if (response.error !== undefined) {
        if (typeof response.error !== 'string' || response.value !== undefined)
          throw new Error('Invalid typecheck failure response.')
        failure = response.error
      } else {
        assertTypecheckCompletion(response.value, project)
        completion = response.value
      }
    },
  })
  options.signal.throwIfAborted()
  if (exited.reason === 'timeout')
    throw new Error(
      `TypeScript type-test checking exceeded fileTimeout (${project.fileTimeout}ms).`
    )
  if (exited.reason !== 'exit' || exited.code !== 0 || exited.signal)
    throw new Error('TypeScript type-test checking did not exit cleanly.')
  if (failure !== undefined) throw new Error(failure)
  if (!completion)
    throw new Error('TypeScript type-test checking returned no completion.')
  for (const file of completion.files) {
    options.signal.throwIfAborted()
    const entry = project.entries.find(
      (candidate) => candidate.id === file.entryId
    )!
    const canonical = await realpath(entry.file)
    if (
      canonical !== selectedSources.get(entry.id) ||
      createHash('sha256')
        .update(await readFile(canonical))
        .digest('hex') !== file.revision
    )
      throw new Error(
        `Type-test source changed before authoritative completion: ${entry.file}`
      )
  }
  options.signal.throwIfAborted()
  return completion
}
