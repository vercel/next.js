import type { CompilerAliases } from './compiler/aliases'
import { runTestProcess } from './execution/process'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import globOriginal from 'next/dist/compiled/glob'
import type { TestConfig, TestProjectConfig } from './config'
import { assignBrowserInstanceIds } from './browser-instances'
import { inheritGlobalTestSequence } from './runner/sequence'
import { randomUUID } from 'node:crypto'
import { openCompilerTransformBroker } from './compiler/transform-broker'
import type {
  CompilerTransformInput,
  CompilerTransformResult,
} from './compiler/transform-hooks'

interface SetupProject {
  name: string
  globalSetup: string[]
  provide: Record<string, unknown>
  inheritedProvide?: Record<string, unknown>
}

interface RemoteError {
  name: string
  message: string
  stack?: string
}
function remoteError(value: RemoteError): Error {
  const error = new Error(value.message)
  error.name = value.name
  error.stack = value.stack
  return error
}

/** A configuration realm lives until the owner has finished all test resources. */
export async function openTestConfigModule(
  file: string | undefined,
  projectDir: string,
  signal?: AbortSignal,
  context: 'root' | 'project' = 'root'
) {
  let send!: (message: unknown) => Promise<void>
  let pending:
    | {
        resolve(value: any): void
        reject(error: unknown): void
        timer?: ReturnType<typeof setTimeout>
      }
    | undefined
  let closing = false
  let closed = false
  let transformsRevoked = false
  let terminalError: unknown
  let transformBroker:
    | Awaited<ReturnType<typeof openCompilerTransformBroker>>
    | undefined
  const transformInputs = new Set<string>()
  const transforms = new Map<
    string,
    {
      resolve(value: CompilerTransformResult): void
      reject(error: unknown): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  function rejectTransforms(error: unknown) {
    for (const transform of transforms.values()) {
      clearTimeout(transform.timer)
      transform.reject(error)
    }
    transforms.clear()
  }
  let ownerSignal = signal
  const controller = new AbortController()
  const cancel = () => controller.abort(ownerSignal?.reason)
  if (ownerSignal?.aborted) cancel()
  else ownerSignal?.addEventListener('abort', cancel, { once: true })
  const request = (message: object, timeoutMs = 120000): Promise<any> => {
    if (pending || closing || closed)
      return Promise.reject(
        terminalError ?? new Error('Test configuration session is unavailable.')
      )
    return new Promise((resolve, reject) => {
      pending = {
        resolve,
        reject,
        timer: setTimeout(
          () =>
            controller.abort(
              new Error('Test configuration request timed out.')
            ),
          timeoutMs
        ),
      }
      send(message).catch((error) => {
        clearTimeout(pending?.timer)
        pending = undefined
        reject(error)
        controller.abort(error)
      })
    })
  }
  // The initial response arrives asynchronously, after onReady has installed send.
  const loaded = new Promise<unknown>((resolve, reject) => {
    pending = { resolve, reject }
  })
  const exit = runTestProcess(require.resolve('./config-worker'), {
    cwd: projectDir,
    env: process.env,
    input: {
      file,
      persistent: true,
      ...(context === 'project' ? { projectConfig: true } : {}),
    },
    signal: controller.signal,
    shutdownGraceMs: 10000,
    onReady(value) {
      send = value
    },
    onMessage(message: any) {
      if (message?.type === 'compiler-transform-result') {
        const response = transforms.get(message.id)
        if (!response) {
          if (closing || transformsRevoked || controller.signal.aborted) return
          throw new Error('Unexpected compiler transform response.')
        }
        transforms.delete(message.id)
        clearTimeout(response.timer)
        if (message.error) response.reject(remoteError(message.error))
        else {
          for (const dependency of message.value.dependencies)
            transformInputs.add(dependency)
          response.resolve(message.value)
        }
        return
      }
      if (!pending) {
        if (message?.type === 'test-config-failed') {
          terminalError ??= remoteError(message.error)
          controller.abort(terminalError)
          return
        }
        throw new Error('Unexpected test configuration response.')
      }
      const response = pending
      clearTimeout(response.timer)
      pending = undefined
      if (message?.type === 'test-config-failed') {
        response.reject(remoteError(message.error))
      } else if (
        message?.type === 'test-config-loaded' ||
        message?.type === 'test-config-result'
      ) {
        response.resolve(
          message.type === 'test-config-loaded'
            ? {
                value: message.value,
                compilerTransforms: message.compilerTransforms,
                compilerAliases: message.compilerAliases,
              }
            : message.value
        )
      } else {
        response.reject(new Error('Invalid test configuration response.'))
        throw new Error('Invalid test configuration response.')
      }
    },
    onOutput(stream, chunk) {
      ;(stream === 'stdout' ? process.stdout : process.stderr).write(chunk)
    },
  }).then(
    (result) => {
      closed = true
      void transformBroker?.dispose().catch(() => {})
      rejectTransforms(new Error('Configuration transform owner exited.'))
      if (
        !(result.reason === 'cancelled' && ownerSignal?.aborted) &&
        (result.reason !== 'exit' || result.code !== 0 || !closing)
      )
        terminalError ??= new Error(
          `Test configuration session ended unexpectedly (${result.reason}).`
        )
      clearTimeout(pending?.timer)
      pending?.reject(
        terminalError ??
          (ownerSignal?.aborted
            ? ownerSignal.reason
            : new Error('Test configuration closed.'))
      )
      pending = undefined
      return result
    },
    (error) => {
      terminalError = error
      closed = true
      void transformBroker?.dispose().catch(() => {})
      rejectTransforms(error)
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
    }
  )
  async function dispose() {
    transformsRevoked = true
    try {
      await transformBroker?.dispose()
    } catch (error) {
      terminalError ??= error
    }
    rejectTransforms(new Error('Configuration transform owner closed.'))
    if (ownerSignal?.aborted && !closed) {
      closing = true
      controller.abort(ownerSignal.reason)
    }
    if (!closing && !closed) {
      try {
        await request({ type: 'shutdown' }, 10000)
      } catch (error) {
        if (!ownerSignal?.aborted || error !== ownerSignal.reason)
          terminalError ??= error
        controller.abort(error)
      } finally {
        closing = true
      }
    }
    await exit
    ownerSignal?.removeEventListener('abort', cancel)
    if (terminalError) throw terminalError
  }
  const deadline = setTimeout(
    () =>
      controller.abort(new Error('Test configuration evaluation timed out.')),
    120000
  )
  try {
    const result = (await loaded) as {
      value: unknown
      compilerAliases?: CompilerAliases
      compilerTransforms?: {
        realm: string
        names: string[]
        dependencies: string[]
      }
    }
    if (result.compilerTransforms) {
      const realm = result.compilerTransforms.realm
      for (const dependency of result.compilerTransforms.dependencies)
        transformInputs.add(dependency)
      transformBroker = await openCompilerTransformBroker(
        realm,
        (input: CompilerTransformInput) => {
          if (
            closing ||
            closed ||
            transformsRevoked ||
            controller.signal.aborted
          )
            return Promise.reject(
              new Error('Configuration transform owner is closed.')
            )
          return new Promise<CompilerTransformResult>((resolve, reject) => {
            const id = randomUUID()
            const timer = setTimeout(() => {
              const error = new Error('Configuration transform timed out.')
              transforms.delete(id)
              reject(error)
              controller.abort(error)
            }, 30000)
            transforms.set(id, { resolve, reject, timer })
            send({ type: 'compiler-transform', id, realm, input }).catch(
              (error) => {
                clearTimeout(timer)
                transforms.delete(id)
                reject(error)
                controller.abort(error)
              }
            )
          })
        },
        {
          signal: controller.signal,
          configFile: file,
          configDependencies: [...transformInputs],
          onCancelled: () =>
            controller.abort(
              new Error(
                'Compiler transform consumer closed during its request.'
              )
            ),
        }
      )
    }
    clearTimeout(deadline)
    return {
      value: result.value,
      compilerAliases: result.compilerAliases,
      compilerTransform: transformBroker?.descriptor,
      compilerTransformNames: result.compilerTransforms?.names ?? [],
      get compilerTransformInputs() {
        return [...transformInputs]
      },
      retainForWatch(lifetime: AbortSignal) {
        if (closing || closed || controller.signal.aborted)
          throw new Error(
            'The retained test configuration realm is unavailable; restart test watch.'
          )
        ownerSignal?.removeEventListener('abort', cancel)
        ownerSignal = lifetime
        if (ownerSignal.aborted) cancel()
        else ownerSignal.addEventListener('abort', cancel, { once: true })
      },
      retainCompilerTransformsForWatch(lifetime: AbortSignal) {
        if (!transformBroker || closing || closed || controller.signal.aborted)
          throw new Error(
            'The retained compiler configuration realm is unavailable; restart test watch.'
          )
        ownerSignal?.removeEventListener('abort', cancel)
        ownerSignal = lifetime
        if (ownerSignal.aborted) cancel()
        else ownerSignal.addEventListener('abort', cancel, { once: true })
      },
      async setup(projects: SetupProject[]) {
        return request({ type: 'setup', projects }) as Promise<
          Record<string, Record<string, unknown>>
        >
      },
      async setupRoot(project: SetupProject) {
        const contexts = await request({
          type: 'setup-root',
          projects: [project],
        })
        return contexts[project.name] as Record<string, unknown>
      },
      async teardown() {
        await request({ type: 'teardown' }, 10000)
      },
      dispose,
    }
  } catch (error) {
    clearTimeout(deadline)
    await transformBroker?.dispose()
    controller.abort(error)
    await exit
    ownerSignal?.removeEventListener('abort', cancel)
    throw error
  }
}

type ConfigRealm = Awaited<ReturnType<typeof openTestConfigModule>>
const projectConfigPattern = /^vite(?:st)?(?:\.[\w-]+)?\.config\./
const glob = promisify(globOriginal)

/** Resolve paths without evaluating arbitrary files matched by a projects glob. */
export async function resolveTestProjectConfigs(
  definitions: unknown[],
  projectDir: string,
  signal?: AbortSignal
) {
  const files: string[] = []
  const patterns: string[] = []
  const ignored = ['**/node_modules/**', '**/*.timestamp-*', '**/.DS_Store']
  async function add(file: string, globbed = false) {
    signal?.throwIfAborted()
    const info = await stat(file)
    if (info.isDirectory()) {
      const names = new Set(await readdir(file))
      const configs = ['vitest.config', 'vite.config'].flatMap((prefix) =>
        ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'].map(
          (ext) => prefix + ext
        )
      )
      const selected = configs.find((name) => names.has(name))
      if (!selected) {
        throw new Error(
          `Test project directory ${file} has no executable Vitest configuration. Directory-only projects need a Next compiler root and remain unsupported.`
        )
      }
      file = path.join(file, selected)
    } else if (!info.isFile()) {
      throw new TypeError(`Unexpected test project file type: ${file}`)
    }
    if (!projectConfigPattern.test(path.basename(file))) {
      throw new Error(
        `${globbed ? 'The projects glob matched' : 'Projects definition references'} ${path.relative(projectDir, file)}, which is not a Vitest/Vite project configuration. Use vitest.config.*, vite.config.*, or (vitest|vite).*.config.*.`
      )
    }
    files.push(await realpath(file))
  }
  for (const definition of definitions) {
    signal?.throwIfAborted()
    if (typeof definition !== 'string') continue
    const pattern = definition.replace('<rootDir>', projectDir)
    if (pattern.startsWith('!')) {
      ignored.push(pattern.slice(1))
    } else if (globOriginal.hasMagic(pattern)) {
      patterns.push(pattern)
    } else {
      const file = path.resolve(projectDir, pattern)
      try {
        await add(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `Projects definition references a non-existing file or directory: ${file}`
          )
        }
        throw error
      }
    }
  }
  for (const pattern of patterns) {
    signal?.throwIfAborted()
    const matches = await glob(pattern, {
      cwd: projectDir,
      absolute: true,
      dot: true,
      nodir: false,
      ignore: ignored,
    })
    for (const file of matches.sort()) await add(file, true)
  }
  return [...new Set(files)]
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * File projects own separate configuration realms and test settings. The
 * compiler still belongs to the invoking Next application, so a differing
 * project root must remain an explicit compiler-mapping diagnostic.
 */
export async function openTestProjectModules(
  value: unknown,
  projectDir: string,
  normalize: (value: unknown) => TestConfig,
  signal?: AbortSignal
) {
  if (
    !record(value) ||
    !record(value.test) ||
    !Array.isArray(value.test.projects) ||
    !value.test.projects.some((project) => typeof project === 'string')
  ) {
    return undefined
  }
  const test = value.test
  const definitions = test.projects as unknown[]
  const { projects: _projects, globalSetup, ...defaults } = test
  const validated = normalize({ ...value, test: { ...test, projects: [{}] } })
  const compilerRoot = await realpath(projectDir)
  const realms: ConfigRealm[] = []
  const owners = new Map<string, ConfigRealm>()
  const projectRealms = new Map<TestProjectConfig, ConfigRealm>()
  const configs: TestProjectConfig[] = []
  let disposing: Promise<void> | undefined
  function dispose() {
    return (disposing ??= (async () => {
      const failures: unknown[] = []
      for (const realm of [...realms].reverse()) {
        try {
          await realm.dispose()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length) {
        throw new AggregateError(
          failures,
          'Test project configuration cleanup failed.'
        )
      }
    })())
  }
  try {
    // Keep object-form behavior for existing inline projects. File projects do
    // not inherit these defaults; only the root's provided context is shared.
    for (const [index, definition] of definitions.entries()) {
      if (typeof definition === 'string') continue
      const inlineProjects = normalize({
        ...value,
        test: { ...defaults, projects: [definition] },
      }).projects
      for (const inline of inlineProjects) {
        if (
          !inline.browserInstance &&
          record(definition) &&
          !(record(definition.test) ? definition.test.name : definition.name)
        ) {
          inline.profile.id = `project-${index}`
        }
        configs.push(inline)
      }
    }
    const files = await resolveTestProjectConfigs(
      definitions,
      compilerRoot,
      signal
    )
    for (const file of files) {
      signal?.throwIfAborted()
      const realm = await openTestConfigModule(
        file,
        projectDir,
        signal,
        'project'
      )
      realms.push(realm)
      const child = realm.value
      if (!record(child) || !record(child.test)) {
        // Preserve the existing compiler-option/configuration diagnostics.
        normalize(child)
        throw new Error(
          `Project configuration ${file} must export a test configuration.`
        )
      }
      const { root, ...compilerOptions } = child
      const { root: testRoot, ...settings } = child.test
      const configuredRoot = testRoot ?? root
      if (configuredRoot !== undefined && typeof configuredRoot !== 'string') {
        throw new TypeError(
          `Project configuration ${file} root must be a string.`
        )
      }
      const childRoot = await realpath(
        path.resolve(
          path.dirname(file),
          (configuredRoot as string | undefined) ?? '.'
        )
      )
      if (childRoot !== compilerRoot) {
        throw new Error(
          `Project configuration ${file} resolves root ${childRoot}, but Next application compilation is owned by ${compilerRoot}. Set root to the shared Next application root; independent compiler roots remain unsupported.`
        )
      }
      if (Array.isArray(settings.projects)) {
        throw new Error(
          `Nested project container ${file} requires a Next compiler/configuration ownership mapping and remains unsupported.`
        )
      }
      let name = settings.name
      if (name === undefined) {
        try {
          name = JSON.parse(
            await readFile(
              path.join(path.dirname(file), 'package.json'),
              'utf8'
            )
          ).name
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        if (typeof name !== 'string' || !name)
          name = path.basename(path.dirname(file))
      }
      const config = normalize({
        ...compilerOptions,
        test: { ...settings, name },
      })
      for (const project of config.projects) {
        project.sequence = inheritGlobalTestSequence(
          project.sequence,
          validated.projects[0].sequence
        )
        if (realm.compilerAliases)
          project.compilerAliases = realm.compilerAliases
        configs.push(project)
        projectRealms.set(project, realm)
      }
    }
    assignBrowserInstanceIds(configs)
    for (const [project, realm] of projectRealms)
      owners.set(project.profile.id, realm)
    if (!configs.length)
      throw new Error('No test projects matched the project definitions.')
    return {
      config: { ...validated, projects: configs },
      /** Exact project configuration sources, not their transitive imports. */
      get watchInputs() {
        return [
          ...new Set([
            ...files,
            ...realms.flatMap((realm) => [
              ...realm.compilerTransformInputs,
              ...(realm.compilerAliases?.inputs ?? []),
            ]),
          ]),
        ]
      },
      rootProject: {
        name: typeof test.name === 'string' ? test.name : '',
        globalSetup: validated.projects[0].globalSetup ?? [],
        provide: validated.projects[0].provide ?? {},
      },
      owns: (project: TestProjectConfig) => owners.has(project.profile.id),
      compilerTransform: (project: TestProjectConfig) =>
        owners.get(project.profile.id)?.compilerTransform,
      compilerTransformNames: realms.flatMap(
        (realm) => realm.compilerTransformNames
      ),
      async setup(projects: SetupProject[]) {
        const contexts: Record<string, Record<string, unknown>> = Object.create(
          null
        )
        for (const realm of realms) {
          const selected = projects.filter(
            (project) => owners.get(project.name) === realm
          )
          if (selected.length)
            Object.assign(contexts, await realm.setup(selected))
        }
        return contexts
      },
      async teardown() {
        const failures: unknown[] = []
        for (const realm of [...realms].reverse()) {
          try {
            await realm.teardown()
          } catch (error) {
            failures.push(error)
          }
        }
        if (failures.length) {
          throw new AggregateError(
            failures,
            'Test project global teardown failed.'
          )
        }
      },
      dispose,
    }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Test project configuration and cleanup failed.'
      )
    }
    throw error
  }
}

/** Read-only callers evaluate fresh modules and immediately reclaim the realm. */
export async function evaluateTestConfig(
  file: string,
  projectDir: string
): Promise<unknown> {
  const session = await openTestConfigModule(file, projectDir)
  try {
    return session.value
  } finally {
    await session.dispose()
  }
}
