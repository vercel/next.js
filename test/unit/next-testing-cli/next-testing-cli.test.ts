import { createHash } from 'crypto'
import { getDefineEnv } from 'next/dist/build/define-env'
import { usesInSourceTestMarker } from 'next/dist/experimental/testing/in-source'
import loadConfig from 'next/dist/server/config'
import { PHASE_PRODUCTION_BUILD } from 'next/dist/shared/lib/constants'
import { pathToFileURL } from 'node:url'
import {
  configDefaults,
  coverageConfigDefaults,
  defaultInclude,
  defaultExclude,
  defaultBrowserPort,
  defineConfig,
  defineProject,
  mergeConfig,
} from 'next/dist/experimental/testing/config-api'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { retry } from 'next-test-utils'
import {
  evaluateTestConfig,
  openTestConfigModule,
} from 'next/dist/experimental/testing/config-modules'
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  parseTestConfig,
  loadTestConfig,
  normalizeTestConfig,
  applyTestConfigOverrides,
} from 'next/dist/experimental/testing/config'
import { discoverTests } from 'next/dist/experimental/testing/discovery'
import { collectStaticTestCases } from 'next/dist/experimental/testing/static-collection'
import {
  assertTypecheckCompletion,
  parseTestTypecheckConfig,
  runTypecheckProject,
} from 'next/dist/experimental/testing/typecheck'
import {
  parseTestShard,
  shardTestProjects,
} from 'next/dist/experimental/testing/scheduling'
import { nextTestRunner } from 'next/dist/cli/next-test-runner'
import * as capabilities from 'next/dist/experimental/testing/capabilities'
import { remapCoverage } from 'next/dist/experimental/testing/coverage/remap'
import { runTests } from 'next/dist/experimental/testing/orchestrator'
import { watchTests } from 'next/dist/experimental/testing/watch-orchestrator'
import { watchTestFiles } from 'next/dist/experimental/testing/incremental/watch-files'
import {
  runWatchProcess,
  WatchOwnershipError,
} from 'next/dist/experimental/testing/watch-process'
import { createTestCompilerSession } from 'next/dist/experimental/testing/compiler'
import { execute } from 'next/dist/experimental/testing/execution/execute'
import {
  createApplicationServer,
  ApplicationServerError,
} from 'next/dist/experimental/testing/browser/server'
import { createBrowserHost } from 'next/dist/experimental/testing/browser/host'
import { commitSnapshotUpdates } from 'next/dist/experimental/testing/assertions/snapshots'
import type {
  CompiledTestArtifact,
  CompiledTestCohort,
  ExecuteTestOptions,
  TestEntry,
} from 'next/dist/experimental/testing/contracts'
import type { DiscoveredTestProject } from 'next/dist/experimental/testing/discovery'
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'

jest.mock('next/dist/experimental/testing/capabilities', () => ({
  ...jest.requireActual('next/dist/experimental/testing/capabilities'),
  requireTestCapability: jest.fn(
    jest.requireActual('next/dist/experimental/testing/capabilities')
      .requireTestCapability
  ),
}))

jest.mock('next/dist/experimental/testing/scheduling', () => ({
  ...jest.requireActual('next/dist/experimental/testing/scheduling'),
  acquireTestRunLock: async () => ({ unlock: async () => {} }),
}))

jest.mock('next/dist/experimental/testing/coverage/remap', () => ({
  remapCoverage: jest.fn(),
}))

jest.mock('next/dist/experimental/testing/compiler', () => ({
  createTestCompilerSession: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/execution/execute', () => ({
  execute: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/assertions/snapshots', () => ({
  ...jest.requireActual('next/dist/experimental/testing/assertions/snapshots'),
  commitSnapshotUpdates: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/incremental/watch-files', () => ({
  watchTestFiles: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/watch-process', () => ({
  ...jest.requireActual('next/dist/experimental/testing/watch-process'),
  runWatchProcess: jest.fn(),
}))

// Emitted .js imports and extensionless paths resolve to the same mocked files.
jest.mock('next/dist/experimental/testing/browser/server', () => ({
  ...jest.requireActual('next/dist/experimental/testing/browser/server'),
  createApplicationServer: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/browser/host', () => ({
  createBrowserHost: jest.fn(),
}))

describe('Next-owned test discovery and configuration', () => {
  it('requires the collection listing switch before accepting JSON output', async () => {
    await expect(nextTestRunner(undefined, { json: true })).rejects.toThrow(
      '--json requires --list'
    )
  })

  it('requires JSON collection before accepting a static parser option', async () => {
    await expect(
      nextTestRunner(undefined, { list: true, staticParse: true })
    ).rejects.toThrow('--staticParse requires --list --json')
    await expect(
      nextTestRunner(undefined, { staticParse: false })
    ).rejects.toThrow('--staticParse requires --list --json')
  })

  it('preserves configured seed and separate file/test shuffle settings', () => {
    const config = parseTestConfig({
      projects: [
        {
          name: 'node',
          sequence: {
            seed: 0.5,
            shuffle: { files: false, tests: true },
            concurrent: true,
            hooks: 'parallel',
          },
        },
      ],
    })
    expect(config.projects[0].sequence).toEqual({
      seed: 0.5,
      shuffle: { files: false, tests: true },
      concurrent: true,
      hooks: 'parallel',
    })
  })

  it('shares the root seed and file order while allowing project test-order overrides', () => {
    const config = normalizeTestConfig({
      test: {
        sequence: { seed: 0, shuffle: true, concurrent: true },
        projects: [
          {
            test: {
              name: 'first',
              sequence: { seed: 99, shuffle: false, concurrent: false },
            },
          },
          { test: { name: 'second', sequence: { shuffle: { tests: true } } } },
        ],
      },
    })
    expect(config.projects.map(({ sequence }) => sequence)).toEqual([
      { seed: 0, shuffle: { files: true, tests: false }, concurrent: false },
      { seed: 0, shuffle: { files: true, tests: true }, concurrent: true },
    ])
  })

  it.each([
    { seed: NaN },
    { seed: '1' },
    { concurrent: 1 },
    { shuffle: { tests: 1 } },
    { shuffle: { files: 'yes' } },
  ])('rejects malformed sequence settings %j', (sequence) => {
    expect(() =>
      parseTestConfig({ projects: [{ name: 'node', sequence }] })
    ).toThrow('sequence')
  })

  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'next-testing-cli-'))
    await cp(path.join(__dirname, 'fixtures'), directory, { recursive: true })
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it('preserves explicit zero and false CLI overrides above executable project defaults', () => {
    const original = normalizeTestConfig({
      test: {
        retry: 2,
        bail: 3,
        allowOnly: true,
        passWithNoTests: true,
        testTimeout: 100,
        hookTimeout: 200,
      },
    })
    const resolved = applyTestConfigOverrides(original, {
      retry: 0,
      bail: 0,
      allowOnly: false,
      passWithNoTests: false,
      testTimeout: 0,
      hookTimeout: undefined,
    })
    expect(resolved.projects[0]).toMatchObject({
      retry: 0,
      bail: 0,
      allowOnly: false,
      passWithNoTests: false,
      testTimeout: 0,
      hookTimeout: 200,
    })
    expect(original.projects[0]).toMatchObject({ retry: 2, testTimeout: 100 })
    expect(
      applyTestConfigOverrides(original, { testTimeout: 240000 }).projects[0]
        .fileTimeout
    ).toBe(240000)
  })

  it.each([
    { retry: -1 },
    { bail: -1 },
    { allowOnly: 'false' },
    { passWithNoTests: 'true' },
  ])('rejects invalid execution defaults %j', (options) => {
    expect(() => normalizeTestConfig({ test: options })).toThrow()
  })

  it.each(['retry', 'bail', 'testTimeout', 'hookTimeout'] as const)(
    'validates the %s CLI value before reading configuration',
    async (name) => {
      await expect(
        nextTestRunner(path.join(directory, 'missing'), { [name]: '-1' })
      ).rejects.toThrow(`--${name} must be a nonnegative integer`)
    }
  )

  it('allows an explicitly empty file listing and preserves ordinary empty failure', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    await nextTestRunner(directory, {
      list: true,
      filter: ['missing'],
      passWithNoTests: true,
      retry: '0',
    })
    expect(log).toHaveBeenCalledWith('0 test file(s) selected.')
    await expect(
      nextTestRunner(directory, { list: true, filter: ['missing'] })
    ).rejects.toThrow('No test files matched')
  })

  it('publishes an empty JSON file filter without requiring passWithNoTests', async () => {
    const child = spawn(
      process.execPath,
      [
        require.resolve('next/dist/bin/next'),
        'test',
        directory,
        '--list',
        '--json',
        '--staticParse=false',
        '--filter',
        'missing',
      ],
      {
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (text) => {
      stdout += text
    })
    child.stderr.setEncoding('utf8').on('data', (text) => {
      stderr += text
    })
    const [code] = await once(child, 'close')
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
    expect(JSON.parse(stdout)).toEqual([])
  })

  it('retains explicit project display names separately from unnamed profile IDs', () => {
    expect(parseTestConfig({}).projects[0].displayName).toBeUndefined()
    expect(
      normalizeTestConfig({ test: {} }).projects[0].displayName
    ).toBeUndefined()
    expect(
      normalizeTestConfig({ test: { name: 'default' } }).projects[0].displayName
    ).toBe('default')
    expect(
      parseTestConfig({ projects: [{ name: 'named', environment: 'node' }] })
        .projects[0].displayName
    ).toBe('named')
  })

  it.each([undefined, '--staticParse=true'])(
    'lists static declaration syntax without evaluating setup, fixtures or bodies (%s)',
    async (staticOption) => {
      directory = await realpath(directory)
      await writeFile(
        path.join(directory, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'named',
              environment: 'node',
              include: ['static-list/declarations.mjs'],
              setupFiles: ['static-list/setup.mjs'],
              globalSetup: ['static-list/global-setup.mjs'],
              allowOnly: true,
            },
          ],
        })
      )
      const child = spawn(
        process.execPath,
        [
          require.resolve('next/dist/bin/next'),
          'test',
          directory,
          '--list',
          '--json',
          ...(staticOption ? [staticOption] : []),
        ],
        {
          env: { ...process.env, NODE_ENV: 'development' },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30000,
        }
      )
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (text) => {
        stdout += text
      })
      child.stderr.setEncoding('utf8').on('data', (text) => {
        stderr += text
      })
      const [code] = await once(child, 'close')
      expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
      expect(JSON.parse(stdout)).toEqual([
        {
          name: 'outer > aliased',
          file: path.join(directory, 'static-list/declarations.mjs'),
          projectName: 'named',
          location: { line: 5, column: 3 },
        },
        {
          name: 'outer > namespace',
          file: path.join(directory, 'static-list/declarations.mjs'),
          projectName: 'named',
          location: { line: 8, column: 3 },
        },
        {
          name: 'outer > row %i',
          file: path.join(directory, 'static-list/declarations.mjs'),
          projectName: 'named',
          location: { line: 11, column: 21 },
        },
      ])
    }
  )

  it.each(['forbidden-focus', 'parse-error'])(
    'withholds static JSON when public collection fails (%s)',
    async (mode) => {
      if (mode === 'parse-error')
        await cp(
          path.join(directory, 'static-list/invalid.txt'),
          path.join(directory, 'invalid.case.mjs')
        )
      await writeFile(
        path.join(directory, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'named',
              environment: 'node',
              include: [
                mode === 'parse-error'
                  ? 'invalid.case.mjs'
                  : 'static-list/focus-a.mjs',
              ],
              allowOnly: false,
            },
          ],
        })
      )
      const child = spawn(
        process.execPath,
        [
          require.resolve('next/dist/bin/next'),
          'test',
          directory,
          '--list',
          '--json',
        ],
        {
          env: { ...process.env, NODE_ENV: 'development' },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30000,
        }
      )
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (text) => {
        stdout += text
      })
      child.stderr.setEncoding('utf8').on('data', (text) => {
        stderr += text
      })
      const [code] = await once(child, 'close')
      expect(code).toBe(1)
      expect(stdout).toBe('')
      expect(stderr).toContain(
        mode === 'parse-error' ? 'Failed to parse' : 'Unexpected .only modifier'
      )
    }
  )

  it('resolves static focus across selected files before applying the name filter', async () => {
    directory = await realpath(directory)
    const config = normalizeTestConfig({
      test: { include: ['static-list/focus-*.mjs'], allowOnly: true },
    })
    const projects = await discoverTests(directory, config)
    const listed = await collectStaticTestCases(projects)
    expect(listed.errors).toEqual([])
    expect(listed.cases).toEqual([
      {
        name: 'focused > inherited',
        file: path.join(directory, 'static-list/focus-a.mjs'),
        location: { line: 3, column: 3 },
      },
      {
        name: 'focused > nested > chosen',
        file: path.join(directory, 'static-list/focus-a.mjs'),
        location: { line: 5, column: 5 },
      },
      {
        name: 'focused > nested > also inherited',
        file: path.join(directory, 'static-list/focus-a.mjs'),
        location: { line: 6, column: 5 },
      },
    ])
    expect(
      await collectStaticTestCases(projects, {
        testNamePattern: 'nested > chosen',
      })
    ).toEqual({ cases: [listed.cases[1]], errors: [] })
    expect(
      await collectStaticTestCases(projects, { testNamePattern: 'missing' })
    ).toEqual({ cases: [], errors: [] })
    const otherFile = await discoverTests(directory, config, {
      files: ['focus-b'],
    })
    expect(
      (await collectStaticTestCases(otherFile)).cases.map((item) => item.name)
    ).toEqual(['ordinary file'])
  })

  it('retains forbidden static focus facts while failing the collection', async () => {
    const projects = await discoverTests(
      directory,
      normalizeTestConfig({
        test: { include: ['static-list/focus-*.mjs'], allowOnly: false },
      })
    )
    const listed = await collectStaticTestCases(projects)
    expect(listed.cases.map((item) => item.name)).toEqual([
      'focused > inherited',
      'focused > nested > chosen',
      'focused > nested > also inherited',
    ])
    expect(listed.errors.length).toBeGreaterThan(0)
    expect(
      listed.errors.every((error) =>
        error.includes('Unexpected .only modifier')
      )
    ).toBe(true)
  })

  it('reports static parse and empty-module failures without executing their source', async () => {
    directory = await realpath(directory)
    const projects = await discoverTests(
      directory,
      normalizeTestConfig({
        test: {
          include: ['static-list/empty.mjs', 'static-list/invalid.txt'],
          allowOnly: true,
        },
      })
    )
    const listed = await collectStaticTestCases(projects)
    expect(listed.cases).toEqual([])
    expect(listed.errors).toEqual(
      expect.arrayContaining([
        `No test suite found in file ${path.join(directory, 'static-list/empty.mjs')}`,
        expect.stringContaining(
          `Failed to parse ${path.join(directory, 'static-list/invalid.txt')}`
        ),
      ])
    )
    expect(listed.errors).toHaveLength(2)
  })

  it('honors cancellation before starting native static parsing', async () => {
    const projects = await discoverTests(
      directory,
      normalizeTestConfig({
        test: { include: ['static-list/declarations.mjs'] },
      })
    )
    const controller = new AbortController()
    controller.abort(new Error('cancel static discovery'))
    await expect(
      collectStaticTestCases(projects, { signal: controller.signal })
    ).rejects.toThrow('cancel static discovery')
  })

  it.each(['mjs', 'ts', 'mts', 'cjs', 'cts'])(
    'evaluates owned executable %s config with its actual helpers and async environment',
    async (extension) => {
      const file = path.join(directory, `next.test.config.${extension}`)
      const esm = !['cjs', 'cts'].includes(extension)
      await writeFile(
        path.join(directory, 'value.ts'),
        'export const value: number = 42'
      )
      const helper = esm
        ? "import {defineConfig} from 'vitest/config';import {value} from './value';"
        : "const {defineConfig}=require('vitest/config');const value=42;"
      await writeFile(
        file,
        helper +
          (esm ? 'export default ' : 'module.exports=') +
          "defineConfig(async env=>({projects:[{name:'node'}],value,environment:{command:env.command,mode:env.mode},file:" +
          (esm ? 'import.meta.url' : '__filename') +
          '}))'
      )
      const result = await evaluateTestConfig(file, directory)
      expect(result).toMatchObject({
        projects: [{ name: 'node' }],
        value: 42,
        environment: { command: 'serve', mode: 'test' },
      })
      expect((result as { file: string }).file).toBe(
        esm ? pathToFileURL(await realpath(file)).href : await realpath(file)
      )
      await writeFile(
        path.join(directory, 'value.ts'),
        'export const value: number = 84'
      )
      if (esm)
        expect(await evaluateTestConfig(file, directory)).toMatchObject({
          value: 84,
        })
    },
    30000
  )

  it('evaluates top-level await and refuses configuration runner/controller imports', async () => {
    const file = path.join(directory, 'next.test.config.mjs')
    await writeFile(
      file,
      "import {defineConfig} from 'vitest/config';const value=await Promise.resolve(42);export default defineConfig({value})"
    )
    expect(await evaluateTestConfig(file, directory)).toEqual({ value: 42 })
    await writeFile(file, "import 'vitest/node';export default {}")
    await expect(evaluateTestConfig(file, directory)).rejects.toThrow(
      'cannot load the vitest/node runner/controller'
    )
  }, 30000)

  it('retains configuration services until the owning session closes', async () => {
    const file = path.join(directory, 'next.test.config.mjs')
    await writeFile(
      file,
      `import {createServer} from 'node:http';
      const server=createServer((request,response)=>response.end('owned'));
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      export default {url:'http://127.0.0.1:'+server.address().port,pid:process.pid}`
    )
    const session = await openTestConfigModule(file, directory)
    const value = session.value as { url: string; pid: number }
    try {
      expect(await fetch(value.url).then((response) => response.text())).toBe(
        'owned'
      )
    } finally {
      await session.dispose()
    }
    expect(() => process.kill(value.pid, 0)).toThrow()
    await expect(fetch(value.url)).rejects.toThrow()
  }, 30000)

  it('runs global setup in the retained realm and tears down in reverse order', async () => {
    const lifecycle = path.join(directory, 'lifecycle.txt')
    for (const name of ['a', 'b']) {
      await writeFile(
        path.join(directory, `setup-${name}.ts`),
        `import {appendFileSync} from 'node:fs';
         export default async function(project) {
           appendFileSync(${JSON.stringify(lifecycle)}, '${name}');
           project.provide('${name}', new Map([['answer',42n]]));
           return ()=>appendFileSync(${JSON.stringify(lifecycle)}, '${name.toUpperCase()}');
         }`
      )
    }
    const session = await openTestConfigModule(undefined, directory)
    try {
      const result = await session.setup([
        {
          name: 'node',
          provide: { date: new Date(0) },
          globalSetup: ['a', 'b'].map((name) =>
            path.join(directory, `setup-${name}.ts`)
          ),
        },
      ])
      // IPC values originate in Node's serializer realm, outside Jest's realm.
      expect((result.node.date as Date).getTime()).toBe(0)
      for (const key of ['a', 'b']) {
        const value = result.node[key] as Map<string, bigint>
        expect(value.size).toBe(1)
        expect(value.get('answer')).toBe(42n)
      }
      expect(await readFile(lifecycle, 'utf8')).toBe('ab')
    } finally {
      await session.dispose()
    }
    expect(await readFile(lifecycle, 'utf8')).toBe('abBA')
  }, 30000)

  it('does not hide a global teardown failure or stop later teardowns', async () => {
    const lifecycle = path.join(directory, 'teardown.txt')
    await writeFile(
      path.join(directory, 'setup.mjs'),
      `import {appendFileSync} from 'node:fs';
       export default project=>()=>{
         appendFileSync(${JSON.stringify(lifecycle)},project.name);
         if(project.name==='b')throw new Error('teardown failed');
       }`
    )
    const session = await openTestConfigModule(undefined, directory)
    await session.setup(
      ['a', 'b'].map((name) => ({
        name,
        provide: {},
        globalSetup: [path.join(directory, 'setup.mjs')],
      }))
    )
    await expect(session.dispose()).rejects.toThrow(
      'Global setup teardown failed'
    )
    expect(await readFile(lifecycle, 'utf8')).toBe('ba')
  }, 30000)

  it('awaits global teardown and reclaims the configuration realm after cancellation', async () => {
    const controller = new AbortController()
    const file = path.join(directory, 'next.test.config.mjs')
    const marker = path.join(directory, 'cancelled.txt')
    await writeFile(file, 'export default {pid:process.pid}')
    await writeFile(
      path.join(directory, 'setup.mjs'),
      `import {writeFile} from 'node:fs/promises';export default ()=>async()=>writeFile(${JSON.stringify(marker)},'cleaned')`
    )
    const session = await openTestConfigModule(
      file,
      directory,
      controller.signal
    )
    const pid = (session.value as { pid: number }).pid
    await session.setup([
      {
        name: 'node',
        provide: {},
        globalSetup: [path.join(directory, 'setup.mjs')],
      },
    ])
    controller.abort(new Error('user cancellation'))
    await session.dispose()
    expect(await readFile(marker, 'utf8')).toBe('cleaned')
    expect(() => process.kill(pid, 0)).toThrow()
  }, 30000)

  it('translates Vitest project discovery, globals and provided context without ignoring compiler options', () => {
    const config = normalizeTestConfig({
      test: {
        include: ['**/*.case.mjs'],
        provide: { root: 42 },
        projects: [
          { test: { name: 'a', globals: true, provide: { local: 84 } } },
          { test: { name: 'b' } },
        ],
      },
    })
    expect(
      config.projects.map((project) => ({
        name: project.profile.id,
        include: project.include,
        globals: project.globals,
        provide: project.provide,
      }))
    ).toEqual([
      {
        name: 'a',
        include: ['**/*.case.mjs'],
        globals: true,
        provide: { root: 42, local: 84 },
      },
      {
        name: 'b',
        include: ['**/*.case.mjs'],
        globals: undefined,
        provide: { root: 42 },
      },
    ])
    expect(() =>
      normalizeTestConfig({
        resolve: { alias: { app: 'replacement' } },
        test: {},
      })
    ).toThrow('config.resolve.alias (app)')
    expect(
      normalizeTestConfig({ test: { environment: 'jsdom' } }).projects[0]
        .executionEnvironment
    ).toEqual({ name: 'jsdom' })
  })

  it('uses Next configuration precedence and diagnoses ambiguous configs', async () => {
    await writeFile(
      path.join(directory, 'vitest.config.mjs'),
      "throw new Error('lower precedence config must stay inert')"
    )
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({ projects: [{ name: 'preferred' }] })
    )
    expect((await loadTestConfig(directory)).projects[0].profile.id).toBe(
      'preferred'
    )
    await writeFile(
      path.join(directory, 'next.test.config.ts'),
      'export default {}'
    )
    await expect(loadTestConfig(directory)).rejects.toThrow(
      'Ambiguous test configuration'
    )
  })

  it('discovers stable sorted IDs and preserves distinct requested profiles', async () => {
    const config = parseTestConfig({
      projects: [
        { name: 'dev', environment: 'rsc' },
        { name: 'prod', environment: 'rsc', mode: 'production' },
      ],
    })
    const projects = await discoverTests(directory, config)
    expect(projects.map((p) => p.entries.map((e) => e.id))).toEqual([
      ['dev:math.spec.ts', 'dev:nested/page.rsc.spec.tsx'],
      ['prod:math.spec.ts', 'prod:nested/page.rsc.spec.tsx'],
    ])
    expect(projects[1].entries[0].profile.mode).toBe('production')
    expect(path.isAbsolute(projects[0].entries[0].file)).toBe(true)
  })

  it('partitions every project entry while preserving input order for equal physical-path hashes', async () => {
    const projects = await discoverTests(
      directory,
      parseTestConfig({
        projects: [
          { name: 'z', mode: 'production', passWithNoTests: true },
          { name: 'a', passWithNoTests: true },
        ],
      })
    )
    const root = await realpath(directory)
    const ids = (items: DiscoveredTestProject[]) =>
      items.flatMap((item) => item.entries.map((entry) => entry.id)).sort()
    const shards = await Promise.all(
      [1, 2, 3, 4, 5].map(async (index) =>
        ids(
          await shardTestProjects(projects, parseTestShard(`${index}/5`), root)
        )
      )
    )
    const reversed = await Promise.all(
      [1, 2, 3, 4, 5].map(async (index) =>
        ids(
          await shardTestProjects(
            [...projects].reverse(),
            parseTestShard(`${index}/5`),
            root
          )
        )
      )
    )
    // Direct published 5.0.4 BaseSequencer.shard controls. Project names are
    // deliberately absent from its hash, so physical-path ties stay stable.
    expect(shards).toEqual([
      ['z:math.spec.ts'],
      ['a:math.spec.ts'],
      ['z:nested/page.rsc.spec.tsx'],
      ['a:nested/page.rsc.spec.tsx'],
      [],
    ])
    expect(reversed).toEqual([
      ['a:math.spec.ts'],
      ['z:math.spec.ts'],
      ['a:nested/page.rsc.spec.tsx'],
      ['z:nested/page.rsc.spec.tsx'],
      [],
    ])
    expect(shards.flat().sort()).toEqual(ids(projects))
    expect(new Set(shards.flat()).size).toBe(4)
  })

  it('orders selected fresh files by project name and descending source size', async () => {
    await Promise.all([
      writeFile(path.join(directory, 'small.ordered.ts'), 'export {}'),
      writeFile(
        path.join(directory, 'large.ordered.ts'),
        'export {}; // larger'
      ),
    ])
    const projects = await discoverTests(
      directory,
      parseTestConfig({
        projects: [
          { name: 'z', include: ['*.ordered.ts'] },
          { name: 'a', include: ['*.ordered.ts'] },
        ],
      })
    )
    const selected = await shardTestProjects(
      projects,
      { index: 1, count: 1 },
      await realpath(directory)
    )
    expect(selected.map((project) => project.profile.id)).toEqual(['a', 'z'])
    expect(
      selected.map((project) =>
        project.entries.map((entry) => path.basename(entry.file))
      )
    ).toEqual([
      ['large.ordered.ts', 'small.ordered.ts'],
      ['large.ordered.ts', 'small.ordered.ts'],
    ])
  })

  it('keeps unknown source sizes visible ahead of known sizes', async () => {
    const projects = await discoverTests(directory, parseTestConfig({}))
    const project = projects[0]
    project.entries.push({
      ...project.entries[0],
      id: 'default:missing.spec.ts',
      file: path.join(await realpath(directory), 'missing.spec.ts'),
    })
    const selected = await shardTestProjects(
      projects,
      { index: 1, count: 1 },
      await realpath(directory)
    )
    expect(selected[0].entries[0].id).toBe('default:missing.spec.ts')
  })

  it('uses the canonical application root for CLI hash selection', async () => {
    const alias = `${directory}-alias`
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await symlink(
        directory,
        alias,
        process.platform === 'win32' ? 'junction' : 'dir'
      )
      await nextTestRunner(alias, { list: true, shard: '1/2' })
      expect(log).toHaveBeenCalledWith(
        'default:math.spec.ts [node, development, nodejs, turbopack]'
      )
      expect(log).not.toHaveBeenCalledWith(
        expect.stringContaining('default:nested/page.rsc.spec.tsx')
      )
    } finally {
      await rm(alias, { force: true, recursive: process.platform === 'win32' })
    }
  })

  it('rejects more shards than selected files unless empty assignments are allowed', async () => {
    await expect(
      nextTestRunner(directory, { run: true, shard: '3/3' })
    ).rejects.toThrow('--shard count must not exceed')
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    await nextTestRunner(directory, {
      list: true,
      shard: '3/3',
      passWithNoTests: true,
    })
    expect(log).toHaveBeenCalledWith('0 test file(s) selected.')
  })

  it('publishes an allowed empty shard without compiling or inventing passing tests', async () => {
    const outputFile = path.join(directory, 'empty-shard.json')
    // The public CLI loads its execution coordinator through native import().
    // A real child also verifies this empty assignment needs no compiler/app.
    const child = spawn(
      process.execPath,
      [
        require.resolve('next/dist/bin/next'),
        'test',
        directory,
        '--run',
        '--shard',
        '3/3',
        '--passWithNoTests',
        '--reporter',
        'json',
        '--outputFile',
        outputFile,
      ],
      {
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 30000,
      }
    )
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', (text) => {
      stderr += text
    })
    const [code] = await once(child, 'close')
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
    expect(JSON.parse(await readFile(outputFile, 'utf8'))).toMatchObject({
      success: true,
      numTotalTests: 0,
      numPassedTests: 0,
      testResults: [],
    })
  })

  it.each(['0/2', '3/2', '1/0', '1.5/2', '1', '1/9007199254740992'])(
    'rejects invalid shard %s',
    (value) => {
      expect(() => parseTestShard(value)).toThrow('--shard')
    }
  )

  it.each([0, -1, 65, 1.5, 'auto', null])(
    'rejects invalid worker limit %s',
    (maxWorkers) => {
      expect(() => parseTestConfig({ maxWorkers })).toThrow('maxWorkers')
    }
  )

  it('normalizes registered fixture identities and excludes fixture modules from specs', async () => {
    const config = parseTestConfig({
      projects: [
        {
          name: 'browser',
          environment: 'browser',
          browserFixtures: [{ id: 'counter', module: 'math.spec.ts' }],
        },
      ],
    })
    const [project] = await discoverTests(directory, config)
    expect(project.browserFixtures).toEqual([
      {
        id: 'counter',
        module: await realpath(path.join(directory, 'math.spec.ts')),
        exportName: 'default',
      },
    ])
    expect(project.entries.map((entry) => entry.id)).toEqual([
      'browser:nested/page.rsc.spec.tsx',
    ])
  })

  it('rejects duplicate and unsupported fixture registrations', () => {
    const fixture = { id: 'counter', module: 'math.spec.ts' }
    expect(() =>
      parseTestConfig({
        projects: [{ name: 'node', browserFixtures: [fixture] }],
      })
    ).toThrow('requires a browser project')
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            mode: 'production',
            browserFixtures: [fixture],
          },
        ],
      })
    ).not.toThrow()
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            browserFixtures: [fixture, fixture],
          },
        ],
      })
    ).toThrow('Duplicate browser fixture ID')
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            browserFixtures: [{ ...fixture, exportName: '' }],
          },
        ],
      })
    ).toThrow('JavaScript identifier')
  })

  it('rejects fixture symlinks escaping the application', async () => {
    const outside = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-fixture-outside-')
    )
    try {
      await writeFile(path.join(outside, 'fixture.ts'), 'export default 1')
      await symlink(
        path.join(outside, 'fixture.ts'),
        path.join(directory, 'fixture.ts')
      )
      const config = parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            browserFixtures: [{ id: 'outside', module: 'fixture.ts' }],
          },
        ],
      })
      await expect(discoverTests(directory, config)).rejects.toThrow(
        'Browser fixture must be inside the project'
      )
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects coverage combinations before loading configuration', async () => {
    for (const options of [{ watch: true }, { list: true }]) {
      await expect(
        nextTestRunner(path.join(directory, 'missing'), {
          ...options,
          coverage: true,
        })
      ).rejects.toThrow('--coverage requires a one-shot')
    }
    await expect(
      nextTestRunner(path.join(directory, 'missing'), {
        capabilities: true,
        coverage: true,
      })
    ).rejects.toThrow('--capabilities cannot')
  })

  it('rejects coverage snapshot updates before configuration or compilation', async () => {
    await expect(
      nextTestRunner(path.join(directory, 'missing'), {
        coverage: true,
        update: true,
      })
    ).rejects.toThrow('--coverage cannot be combined with --update')
    await expect(
      runTests(directory, [], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        updateSnapshots: true,
      })
    ).rejects.toThrow('Coverage cannot be combined with snapshot updates')
    expect(createTestCompilerSession).not.toHaveBeenCalled()
  })

  it('rejects a selected empty shared watch before its first file can appear', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [
          { name: 'empty_shared', isolate: false, include: ['missing/**'] },
        ],
      })
    )
    await expect(nextTestRunner(directory, { watch: true })).rejects.toThrow(
      'isolate:false currently requires'
    )
    expect(watchTestFiles).not.toHaveBeenCalled()
    expect(createTestCompilerSession).not.toHaveBeenCalled()
  })

  it('does not let an unselected shared project restrict ordinary CLI selection', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [
          { name: 'unused_shared', isolate: false },
          { name: 'ordinary' },
        ],
      })
    )
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    await nextTestRunner(directory, {
      project: 'ordinary',
      list: true,
      maxWorkers: '2',
    })
    expect(log.mock.calls.flat().join('\n')).toContain('ordinary:math.spec.ts')
    expect(log.mock.calls.flat().join('\n')).not.toContain('unused_shared:')
    expect(createTestCompilerSession).not.toHaveBeenCalled()
  })

  it('applies include, exclude, project and file selection', async () => {
    const config = parseTestConfig({
      projects: [
        { name: 'unit', exclude: ['**/*.rsc.spec.tsx'] },
        { name: 'rsc', environment: 'rsc', include: ['**/*.rsc.spec.tsx'] },
      ],
    })
    const selected = await discoverTests(directory, config, {
      project: 'rsc',
      files: ['nested/'],
    })
    expect(selected.flatMap((p) => p.entries.map((e) => e.id))).toEqual([
      'rsc:nested/page.rsc.spec.tsx',
    ])
    await expect(
      discoverTests(directory, config, { project: 'missing' })
    ).rejects.toThrow('Unknown test project')
  })

  it('ignores hidden, dependency, and symlinked trees without following cycles', async () => {
    for (const name of ['.next', 'node_modules', '.git']) {
      await mkdir(path.join(directory, name))
      await writeFile(path.join(directory, name, 'ignored.spec.ts'), '')
    }
    await symlink(directory, path.join(directory, 'cycle'), 'dir')
    const projects = await discoverTests(directory, parseTestConfig({}))
    expect(projects[0].entries).toHaveLength(2)
  })

  it('resolves setup files and does not also collect them as specs', async () => {
    const config = parseTestConfig({
      projects: [{ name: 'unit', setupFiles: ['math.spec.ts'] }],
    })
    const [project] = await discoverTests(directory, config)
    expect(project.setupFiles[0]).toMatch(/math\.spec\.ts$/)
    expect(project.entries.map((entry) => entry.id)).toEqual([
      'unit:nested/page.rsc.spec.tsx',
    ])
  })

  it('rejects invalid name patterns and name-filtered file listing before compilation', async () => {
    await expect(
      nextTestRunner(path.join(directory, 'missing'), { testNamePattern: '[' })
    ).rejects.toThrow('Invalid testNamePattern')
    await expect(
      nextTestRunner(directory, { list: true, testNamePattern: 'work' })
    ).rejects.toThrow('--list currently lists files only')
    await expect(
      nextTestRunner(directory, {
        capabilities: true,
        testNamePattern: 'work',
      })
    ).rejects.toThrow('--capabilities cannot')
  })

  it.each([
    { inspect: 'bad' },
    { inspect: '0', list: true },
    { inspect: '0', watch: true },
    { inspect: '0', coverage: true },
    { inspect: '0', capabilities: true },
  ])(
    'rejects invalid inspector combinations before reading project configuration: %j',
    async (options) => {
      await expect(
        nextTestRunner(path.join(directory, 'missing'), options)
      ).rejects.toThrow(/inspect|--capabilities/)
    }
  )

  it('publishes capabilities without reading project configuration or compiling', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    await nextTestRunner(path.join(directory, 'missing'), {
      capabilities: true,
    })
    const inventory = JSON.parse(log.mock.calls[0][0])
    expect(inventory.version).toBe(1)
    expect(inventory.execution.modes).toEqual(['development', 'production'])
    expect(inventory.features.production.supported).toBe(true)
    expect(inventory.features.production.environments).toEqual([
      'node',
      'rsc',
      'browser',
    ])
    expect(inventory.features.browserComponents).toMatchObject({
      supported: true,
      mode: 'development',
      browser: 'chromium',
    })
    expect(inventory.features.coverage).toMatchObject({
      supported: true,
      mode: 'development',
      environment: 'node',
      execution: 'opt-in one-shot',
      reports: ['json', 'text'],
    })
    expect(inventory.features.coverage.metric).toContain(
      'non-whitespace mapped generated spans'
    )
    expect(inventory.features.coverage.unsupported).toContain(
      'combining coverage with snapshot updates'
    )
    expect(inventory.features.snapshotUpdate.supported).toBe(true)
    expect(inventory.features.watch.supported).toBe(true)
    expect(inventory.features.staticFactoryMocks).toMatchObject({
      supported: true,
      api: 'vi.mock',
    })
  })

  it.each([
    [{ watch: true, run: true }, '--watch cannot be combined'],
    [{ watch: true, update: true }, '--watch cannot be combined'],
    [{ watch: true, list: true }, '--watch cannot be combined'],
    [{ list: true, update: true }, '--update cannot be combined'],
    [{ capabilities: true, run: true }, '--capabilities cannot be combined'],
  ])(
    'rejects unavailable or conflicting CLI options %#',
    async (options, message) => {
      await expect(nextTestRunner(directory, options)).rejects.toThrow(message)
    }
  )

  it('rejects setup symlinks outside the project', async () => {
    await symlink(__filename, path.join(directory, 'outside.ts'))
    await expect(
      discoverTests(
        directory,
        parseTestConfig({
          projects: [{ name: 'unit', setupFiles: ['outside.ts'] }],
        })
      )
    ).rejects.toThrow('Setup file must be inside the project')
  })

  it('rejects duplicate canonical setup identities instead of silently evaluating once', async () => {
    await expect(
      discoverTests(
        directory,
        parseTestConfig({
          projects: [{ name: 'unit', setupFiles: ['setup.ts', './setup.ts'] }],
        })
      )
    ).rejects.toThrow('Duplicate setup files are unsupported')
  })

  it.each([
    { plugins: [] },
    { resolve: { alias: {} } },
    { define: { NODE_ENV: 'test' } },
    { projects: [{ name: 'node', mode: 'test' }] },
    { projects: [{ name: 'node', mode: null }] },
    { projects: [{ name: 'node', environment: null }] },
    { projects: [{ name: 'node', testTimeout: -1 }] },
    { projects: [{ name: 'node', hookTimeout: Infinity }] },
    { projects: [{ name: 'node', fileTimeout: 0 }] },
    { projects: [{ name: 'node', testTimeout: 300000 }] },
    { projects: [{ name: 'node', hookTimeout: 300000 }] },
    { projects: [{ name: 'same' }, { name: 'same' }] },
    { projects: [] },
    { projects: null },
  ])('rejects conflicting or unsupported config %#', (config) => {
    expect(() => parseTestConfig(config)).toThrow(
      'Invalid next.test.config.json'
    )
  })

  it('accepts zero test and hook timeouts while retaining the file supervision deadline', () => {
    const config = parseTestConfig({
      projects: [{ name: 'node', testTimeout: 0, hookTimeout: 0 }],
    })
    expect(config.projects[0]).toMatchObject({
      testTimeout: 0,
      hookTimeout: 0,
    })
    expect(config.projects[0].fileTimeout).toBeGreaterThan(0)
  })

  it('preserves executable and root name-pattern defaults with explicit per-project overrides', () => {
    expect(
      normalizeTestConfig({ test: { testNamePattern: /matched/i } }).projects[0]
        .testNamePattern
    ).toEqual(/matched/i)
    const config = parseTestConfig({
      testNamePattern: 'root',
      projects: [
        { name: 'inherited' },
        { name: 'overridden', testNamePattern: '' },
      ],
    })
    expect(config.projects.map((project) => project.testNamePattern)).toEqual([
      'root',
      '',
    ])
    expect(() => parseTestConfig({ testNamePattern: '[' })).toThrow(
      'valid regular expression'
    )
    expect(() => normalizeTestConfig({ test: { testNamePattern: 1 } })).toThrow(
      'string or RegExp'
    )
  })

  it('rejects production route context before compilation', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [
          {
            name: 'rsc',
            environment: 'rsc',
            mode: 'production',
            route: '/subject',
          },
        ],
      })
    )
    await expect(nextTestRunner(directory, {})).rejects.toThrow(
      'Production test execution supports route-less profiles only'
    )
  })

  it('loads JSON without changing NODE_ENV', async () => {
    const previous = process.env.NODE_ENV
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [{ name: 'production', mode: 'production' }],
      })
    )
    expect((await loadTestConfig(directory)).projects[0].profile.mode).toBe(
      'production'
    )
    expect(process.env.NODE_ENV).toBe(previous)
  })

  it('does not expose config contents in JSON syntax errors', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      '{ "credential": "sensitive-example" broken }'
    )
    await expect(loadTestConfig(directory)).rejects.toThrow(
      'The file must contain valid JSON.'
    )
    await expect(loadTestConfig(directory)).rejects.not.toThrow(
      'sensitive-example'
    )
  })

  it('executes alternative configuration and preserves its evaluation failure', async () => {
    await writeFile(
      path.join(directory, 'vitest.config.ts'),
      "throw new Error('configuration failed')"
    )
    await expect(loadTestConfig(directory)).rejects.toThrow(
      'configuration failed'
    )
  })

  it('lists requested profiles and fails visibly when selection is empty', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    await nextTestRunner(directory, { list: true, filter: ['math'] })
    expect(log).toHaveBeenCalledWith(
      'default:math.spec.ts [node, development, nodejs, turbopack]'
    )
    await expect(
      nextTestRunner(directory, { list: true, filter: ['missing'] })
    ).rejects.toThrow('No test files matched')
  })
})

// These test orchestration with real K reporting and controlled producer seams.
// Actual compilation/worker integration has a separate native acceptance gate.
describe('Next test orchestration', () => {
  const createSession = jest.mocked(createTestCompilerSession)
  const executeFile = jest.mocked(execute)
  const createServer = jest.mocked(createApplicationServer)
  const createBrowser = jest.mocked(createBrowserHost)
  let previousNodeEnv: string | undefined
  let project: DiscoveredTestProject
  let artifact: CompiledTestArtifact
  let compile: jest.Mock
  let dispose: jest.Mock
  let shutdownCompilation: jest.Mock
  let serverDispose: jest.Mock
  let browserDispose: jest.Mock

  beforeEach(() => {
    previousNodeEnv = process.env.NODE_ENV
    ;(process.env as any).NODE_ENV = 'development'
    jest.resetAllMocks()
    jest
      .mocked(capabilities.requireTestCapability)
      .mockImplementation(
        jest.requireActual('next/dist/experimental/testing/capabilities')
          .requireTestCapability
      )
    const config = parseTestConfig({
      projects: [{ name: 'rsc', environment: 'rsc' }],
    })
    project = { ...config.projects[0], entries: [] }
    project.entries.push({
      id: 'rsc:page.spec.tsx',
      file: '/application/page.spec.tsx',
      profile: project.profile,
    })
    artifact = {
      version: 2,
      kind: 'rsc',
      entryId: project.entries[0].id,
      profile: { ...project.profile, environment: 'rsc' },
      revision: 'immutable-1',
      rootDir: '/snapshots/immutable-1',
      entryPath: 'entry.js',
      manifestPage: '/__next_test__/fixture/page',
      manifests: {
        clientReference: 'client.js',
        serverActions: 'actions.json',
      },
      files: ['entry.js', 'client.js', 'actions.json'],
      diagnostics: [],
    }
    compile = jest.fn().mockResolvedValue(artifact)
    dispose = jest.fn().mockResolvedValue(undefined)
    shutdownCompilation = jest.fn().mockResolvedValue(undefined)
    serverDispose = jest.fn().mockResolvedValue(undefined)
    browserDispose = jest.fn().mockResolvedValue(undefined)
    createServer.mockResolvedValue({
      baseURL: 'http://127.0.0.1:1234',
      pid: 123,
      lifetime: 'file',
      attachments: [],
      dispose: serverDispose,
    })
    createBrowser.mockResolvedValue({
      wsEndpoint: 'ws://127.0.0.1/browser',
      dispose: browserDispose,
    })
    const session = {
      compile,
      dispose,
      shutdownCompilation,
      compileCohort: jest.fn(),
    }
    createSession.mockResolvedValue(session)
    executeFile.mockImplementation(async (input, options) => {
      const envelope = {
        version: 1 as const,
        runId: options.runId,
        timestamp: Date.now(),
      }
      options.onEvent({
        ...envelope,
        type: 'file-start',
        entry: options.entry,
        revision: input.revision,
      })
      const result = {
        entryId: input.entryId,
        status: 'passed' as const,
        durationMs: 1,
      }
      options.onEvent({ ...envelope, type: 'file-end', ...result })
      return result
    })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    if (previousNodeEnv === undefined) delete (process.env as any).NODE_ENV
    else (process.env as any).NODE_ENV = previousNodeEnv
    // Production retains attachment roots; these controlled seams create no
    // report artifacts, so remove their temporary directories after each case.
    await Promise.all(
      createServer.mock.calls.map(([options]) =>
        rm(options.outputDir, { recursive: true, force: true })
      )
    )
  })

  async function run(
    signal = new AbortController().signal,
    write = jest.fn(),
    onEvent?: (event: ResultEvent) => void
  ) {
    return runTests('/application', [project], { signal, write, onEvent })
  }

  it('validates explicit isolation without changing unspecified project defaults', () => {
    expect(
      parseTestConfig({ projects: [{ name: 'ordinary' }] }).projects[0].isolate
    ).toBeUndefined()
    expect(
      parseTestConfig({ projects: [{ name: 'shared', isolate: false }] })
        .projects[0].isolate
    ).toBe(false)
    expect(
      parseTestConfig({ projects: [{ name: 'isolated', isolate: true }] })
        .projects[0].isolate
    ).toBe(true)
    expect(() =>
      parseTestConfig({ projects: [{ name: 'bad', isolate: 'false' }] })
    ).toThrow('isolate must be a boolean')
  })

  const retainedSharedArtifact = async () => {
    throw new Error('Controlled shared compiler must not allocate files')
  }

  function sharedProject() {
    const config = parseTestConfig({
      projects: [{ name: 'shared', isolate: false }],
    }).projects[0]
    const entries = ['first.spec.ts', 'second.spec.ts'].map((name) => ({
      id: `shared:${name}`,
      file: `/application/${name}`,
      profile: config.profile,
    }))
    project = { ...config, entries }
    return {
      version: 1 as const,
      artifacts: entries.map((entry) => ({
        version: 2 as const,
        kind: 'node' as const,
        entryId: entry.id,
        profile: { ...entry.profile, environment: 'node' as const },
        revision: 'shared-revision',
        rootDir: '/snapshots/shared',
        entryPath: 'entry.js',
        files: ['entry.js'],
        diagnostics: [],
      })),
    }
  }

  it('retains the compiler lease until one aggregate producer closes both shared files', async () => {
    const cohort = sharedProject()
    let open!: () => void
    const closed = new Promise<void>((resolve) => {
      open = resolve
    })
    const order: string[] = []
    const compileCohort = jest.fn(
      async (_entries: readonly TestEntry[]) => cohort
    )
    createSession.mockResolvedValue({
      compile,
      compileCohort,
      dispose,
      shutdownCompilation,
    })
    const executeCohort = jest.fn(
      async (
        _cohort: CompiledTestCohort,
        values: readonly ExecuteTestOptions[]
      ) => {
        await closed
        const results = values.map((value) => {
          const envelope = {
            version: 1 as const,
            runId: value.runId,
            timestamp: Date.now(),
          }
          value.onEvent({
            ...envelope,
            type: 'file-start',
            entry: value.entry,
            revision: 'shared-revision',
          })
          const result = {
            entryId: value.entry.id,
            status: 'passed' as const,
            durationMs: 1,
          }
          value.onEvent({ ...envelope, type: 'file-end', ...result })
          return result
        })
        order.push('aggregate closed')
        return results
      }
    )
    dispose.mockImplementation(async () => {
      order.push('compiler disposed')
    })
    const running = runTests('/application', [project], {
      signal: new AbortController().signal,
      write: () => {},
      executeCohort,
      allocateArtifact: retainedSharedArtifact,
    })
    try {
      await retry(() => {
        expect(executeCohort).toHaveBeenCalledTimes(1)
      })
      expect(dispose).not.toHaveBeenCalled()
    } finally {
      open()
    }
    expect((await running).status).toBe('passed')
    expect(compileCohort).toHaveBeenCalledTimes(1)
    expect(compileCohort.mock.calls[0][0]).toEqual(project.entries)
    expect(compile).not.toHaveBeenCalled()
    expect(executeFile).not.toHaveBeenCalled()
    expect(order).toEqual(['aggregate closed', 'compiler disposed'])
  })

  it('retires shared execution after an aggregate cleanup failure before disposing compiler artifacts', async () => {
    const cohort = sharedProject()
    const order: string[] = []
    createSession.mockResolvedValue({
      compile,
      compileCohort: jest.fn(async () => cohort),
      dispose,
      shutdownCompilation,
    })
    dispose.mockImplementation(async () => {
      order.push('compiler disposed')
    })
    const summary = await runTests('/application', [project], {
      signal: new AbortController().signal,
      write: () => {},
      allocateArtifact: retainedSharedArtifact,
      executeCohort: async () => {
        order.push('aggregate cleanup failed')
        throw new Error('shared process group cleanup failed')
      },
    })
    expect(summary.status).not.toBe('passed')
    expect(summary.unsafeCleanup).toBe(true)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['aggregate cleanup failed', 'compiler disposed'])
  })

  it.each(['project', 'entry'] as const)(
    'rejects explicit %s execution-realm metadata before compiling a shared cohort',
    async (scope) => {
      sharedProject()
      if (scope === 'project') project.executionEnvironment = { name: 'node' }
      else project.entries[0].executionEnvironment = { name: 'node' }
      await expect(
        runTests('/application', [project], {
          signal: new AbortController().signal,
          write: () => {},
        })
      ).rejects.toThrow('isolate:false currently supports')
      expect(createSession).not.toHaveBeenCalled()
    }
  )

  it('refuses an injected shared executor without parent-retained artifact ownership', async () => {
    sharedProject()
    await expect(
      runTests('/application', [project], {
        signal: new AbortController().signal,
        write: () => {},
        executeCohort: async () => [],
      })
    ).rejects.toThrow('parent-retained artifact allocation')
    expect(createSession).not.toHaveBeenCalled()
  })

  it.each([
    { maxWorkers: 2 },
    { collectOnly: true },
    { coverage: true },
    { inspect: '127.0.0.1:0' },
  ])(
    'rejects unsupported shared execution before a compiler starts: %j',
    async (settings) => {
      sharedProject()
      await expect(
        runTests('/application', [project], {
          signal: new AbortController().signal,
          write: () => {},
          ...settings,
        })
      ).rejects.toThrow('isolate:false currently supports')
      expect(createSession).not.toHaveBeenCalled()
    }
  )

  it('carries collection mode and facts separately from execution events', async () => {
    const original = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (input, options) => ({
      ...(await original(input, options)),
      collection: {
        version: 1,
        entryId: input.entryId,
        revision: input.revision,
        cases: [{ id: `${input.entryId}/0`, name: 'collected case' }],
      },
    }))
    const events: ResultEvent[] = []
    const summary = await runTests('/application', [project], {
      collectOnly: true,
      signal: new AbortController().signal,
      write: () => {},
      snapshotUpdateMode: 'none',
      onEvent: (event) => events.push(event),
    })
    expect(executeFile.mock.calls[0][1]).toMatchObject({
      collectOnly: true,
      snapshotUpdateMode: 'none',
    })
    expect(summary.collections).toEqual([
      {
        version: 1,
        entryId: artifact.entryId,
        revision: artifact.revision,
        cases: [{ id: `${artifact.entryId}/0`, name: 'collected case' }],
      },
    ])
    expect(
      events.some(
        (event) => event.type === 'case-start' || event.type === 'case-end'
      )
    ).toBe(false)
  })

  it('fails successful collection executions that omit collection facts', async () => {
    const summary = await runTests('/application', [project], {
      collectOnly: true,
      signal: new AbortController().signal,
      write: () => {},
      snapshotUpdateMode: 'none',
    })
    expect(summary.status).toBe('failed')
    expect(summary.collections).toEqual([])
  })

  it.each([
    { shuffle: true, order: [1, 3, 5, 4, 6, 7, 2, 0] },
    { shuffle: { files: true, tests: false }, order: [1, 3, 5, 4, 6, 7, 2, 0] },
    { shuffle: { files: false, tests: true }, order: [0, 1, 2, 3, 4, 5, 6, 7] },
  ])(
    'applies the root file shuffle once before worker leases: $shuffle',
    async ({ shuffle, order }) => {
      project.sequence = { seed: 8127, shuffle }
      project.entries = Array.from({ length: 8 }, (_, index) => ({
        ...project.entries[0],
        id: `rsc:file-${index}`,
        file: `/application/file-${index}.tsx`,
      }))
      compile.mockImplementation(async (entry) => ({
        ...artifact,
        entryId: entry.id,
      }))
      expect((await run()).status).toBe('passed')
      expect(compile.mock.calls.map(([entry]) => entry.id)).toEqual(
        order.map((index) => `rsc:file-${index}`)
      )
      expect(project.entries.map(({ id }) => id)).toEqual(
        Array.from({ length: 8 }, (_, index) => `rsc:file-${index}`)
      )
      expect(
        executeFile.mock.calls.every(
          ([, options]) => options.sequence?.seed === 8127
        )
      ).toBe(true)
    }
  )

  it('forwards setup identities in declared order to compilation and execution', async () => {
    project.setupFiles = ['/application/second.ts', '/application/first.ts']
    await run()
    expect(compile).toHaveBeenCalledWith(project.entries[0], {
      signal: expect.any(AbortSignal),
      setupFiles: project.setupFiles,
      setupFilesSequence: 'list',
    })
    expect(executeFile.mock.calls[0][1].setupFiles).toEqual(project.setupFiles)
  })

  it('forwards configured execution controls without replacing false or zero', async () => {
    Object.assign(project, {
      retry: 0,
      bail: 0,
      allowOnly: false,
      passWithNoTests: false,
      testTimeout: 0,
      hookTimeout: 0,
    })
    await run()
    expect(executeFile.mock.calls[0][1]).toMatchObject({
      retry: 0,
      bail: 0,
      allowOnly: false,
      passWithNoTests: false,
      testTimeout: 0,
      hookTimeout: 0,
    })
  })

  it('forwards configured name patterns to workers and preserves explicit CLI clearing', async () => {
    project.testNamePattern = /matched/i
    await run()
    expect(executeFile.mock.calls[0][1].testNamePattern).toEqual(/matched/i)
    await runTests('/application', [project], {
      signal: new AbortController().signal,
      write: jest.fn(),
      testNamePattern: '',
    })
    expect(executeFile.mock.calls[1][1].testNamePattern).toBe('')
  })

  it('counts final failed declarations across files for bail while preserving recovered retries', async () => {
    project.bail = 1
    project.entries.push(
      {
        ...project.entries[0],
        id: 'rsc:second',
        file: '/application/second.ts',
      },
      { ...project.entries[0], id: 'rsc:third', file: '/application/third.ts' }
    )
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
    }))
    executeFile.mockImplementation(async (input, options) => {
      const envelope = {
        version: 1 as const,
        runId: options.runId,
        timestamp: Date.now(),
      }
      options.onEvent({
        ...envelope,
        type: 'file-start',
        entry: options.entry,
      })
      const first = input.entryId === project.entries[0].id
      const test = {
        ...envelope,
        type: 'case-end' as const,
        entryId: input.entryId,
        caseId: `${input.entryId}/test`,
        name: 'retrying test',
        durationMs: 1,
        errors: [],
      }
      options.onEvent({
        ...test,
        attempt: { id: `${input.entryId}/0`, retry: 0, repeat: 0 },
        status: 'failed',
      })
      if (first)
        options.onEvent({
          ...test,
          attempt: { id: `${input.entryId}/1`, retry: 1, repeat: 0 },
          status: 'passed',
        })
      const result = {
        entryId: input.entryId,
        status: first ? ('passed' as const) : ('failed' as const),
        durationMs: 1,
      }
      options.onEvent({ ...envelope, type: 'file-end', ...result })
      return result
    })
    const summary = await run()
    expect(summary.status).toBe('failed')
    expect(summary.cases).toEqual({
      passed: 1,
      failed: 1,
      skipped: 0,
      cancelled: 0,
    })
    expect(executeFile).toHaveBeenCalledTimes(2)
    expect(compile).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(
      executeFile.mock.calls.every(([, options]) => !options.signal.aborted)
    ).toBe(true)
  })

  it('reports an allowed empty invocation without compiling or inventing passing tests', async () => {
    const summary = await runTests('/application', [], {
      signal: new AbortController().signal,
      write: jest.fn(),
      passWithNoTests: true,
    })
    expect(summary.status).toBe('passed')
    expect(summary.cases).toEqual({
      passed: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    })
    expect(createSession).not.toHaveBeenCalled()
    expect(executeFile).not.toHaveBeenCalled()
  })

  it('forwards snapshot updates only for an explicit one-shot opt-in', async () => {
    await run()
    expect(executeFile.mock.calls[0][1].updateSnapshots).toBe(false)
    await runTests('/application', [project], {
      signal: new AbortController().signal,
      write: jest.fn(),
      updateSnapshots: true,
    })
    expect(executeFile.mock.calls[1][1].updateSnapshots).toBe(true)
  })

  it('rejects multiple snapshot writers for the same source before compilation', async () => {
    const other = { ...project, profile: { ...project.profile, id: 'other' } }
    other.entries = [
      {
        ...project.entries[0],
        id: 'other:page.spec.tsx',
        profile: other.profile,
      },
    ]
    await expect(
      runTests('/application', [project, other], {
        signal: new AbortController().signal,
        write: jest.fn(),
        updateSnapshots: true,
        maxWorkers: 2,
      })
    ).rejects.toThrow('single selected profile per source file')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('retains default new-only snapshot ownership for a single route-aware RSC source', async () => {
    project.profile = { ...project.profile, route: '/reference/[slug]' }
    project.entries[0] = { ...project.entries[0], profile: project.profile }
    artifact.profile = { ...project.profile, environment: 'rsc' }
    const summary = await runTests('/application', [project], {
      signal: new AbortController().signal,
      write: jest.fn(),
      snapshotUpdateMode: 'new',
    })
    expect(summary.status).toBe('passed')
    expect(executeFile.mock.calls[0][1].snapshotUpdateMode).toBe('new')
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects conflicting route snapshot writers even for default new-only mode', async () => {
    project.profile = { ...project.profile, route: '/reference/[slug]' }
    project.entries[0] = { ...project.entries[0], profile: project.profile }
    const other = { ...project, profile: { ...project.profile, id: 'other' } }
    other.entries = [
      {
        ...project.entries[0],
        id: 'other:page.spec.tsx',
        profile: other.profile,
      },
    ]
    await expect(
      runTests('/application', [project, other], {
        signal: new AbortController().signal,
        write: jest.fn(),
        snapshotUpdateMode: 'new',
      })
    ).rejects.toThrow('single selected profile per source file')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('distinguishes ordinary failures from unsafe compiler disposal for repeated runs', async () => {
    compile.mockRejectedValue(new Error('Invalid source'))
    expect(await run()).toMatchObject({
      status: 'failed',
      unsafeCleanup: false,
    })
    dispose.mockRejectedValue(new Error('Compiler output owner remains alive'))
    expect(await run()).toMatchObject({
      status: 'failed',
      unsafeCleanup: true,
    })
  })

  it('watches with fresh runs, reloads configuration, and closes after resource cleanup', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-cli-')
    )
    const controller = new AbortController()
    const close = jest.fn().mockResolvedValue(undefined)
    const update = jest.fn().mockResolvedValue(undefined)
    jest.mocked(watchTestFiles).mockResolvedValue({ close, update })
    jest
      .mocked(runWatchProcess)
      .mockImplementation(async (request, options) => {
        if (request.operation === 'run') {
          const result = await runTests(
            request.projectDir,
            request.projects,
            options
          )
          options.signal.throwIfAborted()
          return {
            operation: 'run',
            result,
          }
        }
        return {
          operation: 'metadata',
          directories: {
            directories: [directory],
            outputDirectories: [path.join(directory, 'custom-output')],
            artifactDirectories: [
              {
                parentDirectory: directory,
                basenamePrefixes: ['.next-test-', '.next-test-pending-'],
              },
            ],
          },
        }
      })
    let firstExecuting!: () => void
    const first = new Promise<void>((resolve) => {
      firstExecuting = resolve
    })
    const runs: string[] = []
    let disposals = 0
    const executeNormally = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (input, options) => {
      runs.push(options.runId)
      if (runs.length === 1) {
        firstExecuting()
        await new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true }
          )
        })
      }
      return executeNormally(input, options)
    })
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
      profile: entry.profile,
    }))
    dispose.mockImplementation(async () => {
      disposals++
      if (disposals === 2) controller.abort(new Error('Finished watch test'))
    })
    try {
      await writeFile(path.join(directory, 'first.spec.ts'), '')
      const configFile = path.join(directory, 'next.test.config.json')
      await writeFile(
        configFile,
        JSON.stringify({ projects: [{ name: 'rsc', environment: 'rsc' }] })
      )
      const running = watchTests(directory, {
        signal: controller.signal,
        write: jest.fn(),
      })
      await first
      await writeFile(path.join(directory, 'setup.ts'), '')
      await writeFile(
        configFile,
        JSON.stringify({
          projects: [
            { name: 'rsc', environment: 'rsc', setupFiles: ['setup.ts'] },
          ],
        })
      )
      jest
        .mocked(watchTestFiles)
        .mock.calls[0][0].onChange({ changed: [configFile], removed: [] })
      expect(await running).toEqual({ status: 'cancelled' })
      expect(new Set(runs).size).toBe(2)
      expect(
        jest
          .mocked(runWatchProcess)
          .mock.calls.filter(([request]) => request.operation === 'run')
          .map(([, options]) => options.reporter?.rerun)
      ).toEqual([false, true])
      expect(compile.mock.calls[1][1].setupFiles).toEqual([
        await realpath(path.join(directory, 'setup.ts')),
      ])
      expect(update).toHaveBeenCalled()
      expect(close).toHaveBeenCalledTimes(1)
      expect(disposals).toBe(2)
    } finally {
      controller.abort()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    ['valid facts', true],
    ['empty cases', true],
    ['duplicate facts', false],
    ['unrequested facts', false],
    ['foreign revision', false],
    ['missing file start', false],
    ['missing start revision', false],
    ['missing facts', false],
    ['missing all facts', false],
    ['facts during execution', false],
    ['empty facts during execution', false],
  ] as const)(
    'validates coordinator collection completion: %s',
    async (scenario, accepted) => {
      const entry = project.entries[0]
      const revision = 'observed-collection-revision'
      const collection = {
        version: 1,
        entryId: entry.id,
        revision,
        cases:
          scenario === 'empty cases'
            ? []
            : [{ id: `${entry.id}/0`, name: 'listed test' }],
      }
      const collections =
        scenario === 'duplicate facts'
          ? [collection, collection]
          : scenario === 'unrequested facts'
            ? [
                {
                  ...collection,
                  entryId: 'other:unselected.spec.ts',
                  cases: [],
                },
              ]
            : scenario === 'foreign revision'
              ? [{ ...collection, revision: 'unobserved-revision' }]
              : scenario === 'empty facts during execution' ||
                  scenario === 'missing all facts'
                ? []
                : [collection]
      const request = {
        operation: 'run' as const,
        collectOnly:
          scenario !== 'facts during execution' &&
          scenario !== 'empty facts during execution',
        projectDir: '/application',
        projects: [project],
        snapshotUpdateMode: 'none' as const,
      }
      // The compiled coordinator retains a native dynamic import. Run this
      // transport seam in Node, preserving the ordinary Jest/dist loading rules.
      const child = spawn(
        process.execPath,
        [
          path.join(__dirname, 'coordinator-collection-transport.cjs'),
          require.resolve('next/dist/experimental/testing/watch-process'),
          JSON.stringify({ scenario, accepted, request, collections }),
        ],
        {
          env: { ...process.env, NODE_ENV: 'development' },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30000,
        }
      )
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (text) => {
        stdout += text
      })
      child.stderr.setEncoding('utf8').on('data', (text) => {
        stderr += text
      })
      const [code] = await once(child, 'close')
      expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
      expect(JSON.parse(stdout)).toEqual({ scenario, accepted })
    }
  )

  it('reloads actual Next config and environment in fresh metadata processes', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-config-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      const config = path.join(directory, 'next.config.mjs')
      const env = path.join(directory, '.env.local')
      await writeFile(
        config,
        'console.log("config stdout"); console.error("config stderr"); export default { distDir: process.env.NEXT_TEST_WATCH_OUTPUT }'
      )
      await writeFile(env, 'NEXT_TEST_WATCH_OUTPUT=first-output\n')
      const request = {
        operation: 'metadata' as const,
        projectDir: directory,
        profiles: [project.profile],
      }
      const writeError = jest.fn()
      const options = {
        signal: new AbortController().signal,
        write: jest.fn(),
        reporter: { writeError },
      }
      const first = await actualRun(request, options)
      expect(options.write.mock.calls.map(([text]) => text).join('')).toContain(
        'config stdout'
      )
      expect(
        options.write.mock.calls.map(([text]) => text).join('')
      ).not.toContain('config stderr')
      expect(writeError.mock.calls.map(([text]) => text).join('')).toContain(
        'config stderr'
      )
      expect(first).toMatchObject({
        operation: 'metadata',
        directories: {
          outputDirectories: [path.join(directory, 'first-output', 'dev')],
        },
      })
      await writeFile(
        config,
        'export default { distDir: "changed-" + process.env.NEXT_TEST_WATCH_OUTPUT }'
      )
      await writeFile(env, 'NEXT_TEST_WATCH_OUTPUT=second-output\n')
      const second = await actualRun(request, options)
      expect(second).toMatchObject({
        operation: 'metadata',
        directories: {
          outputDirectories: [
            path.join(directory, 'changed-second-output', 'dev'),
          ],
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it.each(['update', 'ownership'] as const)(
    'stops watch when %s failure leaves no trustworthy change source or owner',
    async (failureKind) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'next-testing-watch-fatal-')
      )
      const controller = new AbortController()
      const close = jest.fn().mockResolvedValue(undefined)
      const update = jest.fn().mockResolvedValue(undefined)
      const write = jest.fn()
      if (failureKind === 'update')
        update
          .mockResolvedValueOnce(undefined)
          .mockRejectedValue(new Error('Subscription update failed'))
      jest.mocked(watchTestFiles).mockResolvedValue({ close, update })
      let completed!: () => void
      const first = new Promise<void>((resolve) => {
        completed = resolve
      })
      let metadataCalls = 0
      jest
        .mocked(runWatchProcess)
        .mockImplementation(async (request, options) => {
          if (request.operation === 'metadata') {
            metadataCalls++
            if (failureKind === 'ownership' && metadataCalls === 3)
              throw new WatchOwnershipError(new Error('Group still alive'))
            return {
              operation: 'metadata',
              directories: { directories: [directory], outputDirectories: [] },
            }
          }
          const result = await runTests(
            request.projectDir,
            request.projects,
            options
          )
          completed()
          return { operation: 'run', result }
        })
      compile.mockImplementation(async (entry) => ({
        ...artifact,
        entryId: entry.id,
        profile: entry.profile,
      }))
      let running: ReturnType<typeof watchTests> | undefined
      try {
        await writeFile(path.join(directory, 'first.spec.ts'), '')
        running = watchTests(directory, {
          signal: controller.signal,
          write,
        })
        await first
        jest
          .mocked(watchTestFiles)
          .mock.calls[0][0].onChange({ changed: [directory], removed: [] })
        expect(await running).toEqual({ status: 'failed' })
        expect(executeFile).toHaveBeenCalledTimes(1)
        expect(close).toHaveBeenCalledTimes(1)
        expect(metadataCalls).toBe(3)
        expect(write).toHaveBeenCalledWith(
          expect.stringContaining(
            failureKind === 'ownership'
              ? 'Watch generation cleanup failed'
              : 'Subscription update failed'
          )
        )
      } finally {
        controller.abort()
        await running?.catch(() => {})
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it('bounds a completed metadata process that retains a live configuration handle', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-terminal-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        import { writeFileSync } from 'node:fs'
        writeFileSync(new URL('./coordinator.pid', import.meta.url), String(process.pid))
        setInterval(() => {}, 1000)
        export default {}
      `
      )
      await expect(
        actualRun(
          {
            operation: 'metadata',
            projectDir: directory,
            profiles: [project.profile],
          },
          { signal: new AbortController().signal, write: jest.fn() }
        )
      ).rejects.toThrow('did not exit after completing or disconnecting')
      const pid = Number(
        await readFile(path.join(directory, 'coordinator.pid'), 'utf8')
      )
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it('accepts normal metadata exit while reclaiming a descendant that retains output and ignores SIGTERM', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-inherited-output-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        import { spawn } from 'node:child_process'
        import { writeFileSync } from 'node:fs'
        const child = spawn(process.execPath, ['-e', \`
          process.on('SIGTERM', () => {})
          setInterval(() => {}, 1000)
          process.send('ready')
        \`], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
        await new Promise((resolve, reject) => {
          child.once('message', resolve)
          child.once('error', reject)
        })
        writeFileSync(new URL('./descendant.pid', import.meta.url), String(child.pid))
        child.disconnect()
        child.unref()
        export default {}
      `
      )
      await expect(
        actualRun(
          {
            operation: 'metadata',
            projectDir: directory,
            profiles: [project.profile],
          },
          { signal: new AbortController().signal, write: jest.fn() }
        )
      ).resolves.toMatchObject({ operation: 'metadata' })
      const pid = Number(
        await readFile(path.join(directory, 'descendant.pid'), 'utf8')
      )
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it('confirms an empty group when its kernel probe reports EPERM', async () => {
    const { closeGenerationGroup } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    const kill = jest
      .spyOn(process, 'kill')
      .mockImplementation((pid, value) => {
        if (value === 0)
          throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
        return true
      })
    await expect(closeGenerationGroup(2147483647)).resolves.toBeUndefined()
    expect(kill.mock.calls.map(([, value]) => value)).toEqual(['SIGTERM', 0])
    kill.mockRestore()
  })

  it('retains a genuine EPERM when process membership still exists', async () => {
    const { closeGenerationGroup } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    const child = spawn(
      process.execPath,
      [
        '-e',
        "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)",
      ],
      { detached: true, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const closed = once(child, 'close')
    await once(child.stdout!, 'data')
    const original = process.kill.bind(process)
    const denied = Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
    const kill = jest
      .spyOn(process, 'kill')
      .mockImplementation((pid, value) => {
        if (pid === -child.pid! && value === 0) throw denied
        return original(pid, value)
      })
    try {
      await expect(closeGenerationGroup(child.pid!)).rejects.toBe(denied)
    } finally {
      kill.mockRestore()
      original(-child.pid!, 'SIGKILL')
      await closed
    }
  }, 15000)

  it('reclaims inherited descendants after a metadata result followed by a process crash', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-crash-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        import { spawn } from 'node:child_process'
        import { writeFileSync } from 'node:fs'
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
        writeFileSync(new URL('./descendant.pid', import.meta.url), String(child.pid))
        process.once('disconnect', () => process.exit(7))
        export default {}
      `
      )
      await expect(
        actualRun(
          {
            operation: 'metadata',
            projectDir: directory,
            profiles: [project.profile],
          },
          { signal: new AbortController().signal, write: jest.fn() }
        )
      ).rejects.toThrow('failed to close successfully (7)')
      const pid = Number(
        await readFile(path.join(directory, 'descendant.pid'), 'utf8')
      )
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it('bounds cancelled configuration evaluation without changing cancellation to failure', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-cancel-')
    )
    const controller = new AbortController()
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    let running: ReturnType<typeof actualRun> | undefined
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        console.log('watch-config-started')
        await new Promise(() => {})
        export default {}
      `
      )
      running = actualRun(
        {
          operation: 'metadata',
          projectDir: directory,
          profiles: [project.profile],
        },
        {
          signal: controller.signal,
          write(text) {
            if (text.includes('watch-config-started')) started()
          },
        }
      )
      await Promise.race([
        ready,
        running.then(() => {
          throw new Error('Expected blocked configuration')
        }),
      ])
      const reason = new Error('Cancel configuration evaluation')
      controller.abort(reason)
      await expect(running).rejects.toBe(reason)
    } finally {
      controller.abort()
      await running?.catch(() => {})
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  function useBrowserProject() {
    const [config] = parseTestConfig({
      projects: [{ name: 'browser', environment: 'browser' }],
    }).projects
    const entry = {
      id: 'browser:flow.spec.ts',
      file: '/application/flow.spec.ts',
      profile: config.profile,
    }
    project = { ...config, entries: [entry] }
    artifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      profile: { ...entry.profile, environment: 'browser' },
      revision: 'browser-revision',
      rootDir: '/snapshots/browser-revision',
      entryPath: 'entry.js',
      files: ['entry.js'],
      diagnostics: [],
      applicationServer: { mode: 'development', lockDistDir: true },
    }
    compile.mockResolvedValue(artifact)
    return artifact
  }

  it('passes the exact artifact and application directory, then disposes after execution closes', async () => {
    const order: string[] = []
    const originalExecute = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (...args) => {
      const result = await originalExecute(...args)
      order.push('process closed')
      return result
    })
    dispose.mockImplementation(async () => {
      order.push('artifact disposed')
    })
    expect((await run()).status).toBe('passed')
    expect(executeFile).toHaveBeenCalledWith(
      artifact,
      expect.objectContaining({
        projectDir: '/application',
        entry: project.entries[0],
        testTimeout: 5000,
        hookTimeout: 10000,
      })
    )
    expect(order).toEqual(['process closed', 'artifact disposed'])
  })

  it('passes resolved production output evidence only after compiler shutdown', async () => {
    const compiled = useBrowserProject()
    ;(process.env as any).NODE_ENV = 'production'
    project.profile.mode = 'production'
    compiled.profile.mode = 'production'
    compiled.applicationServer = {
      mode: 'production',
      lockDistDir: true,
      distDir: '/application/custom-dist',
    }
    createServer.mockImplementation(async () => {
      expect(shutdownCompilation).toHaveBeenCalledTimes(1)
      return {
        baseURL: 'http://127.0.0.1:1234',
        pid: 123,
        lifetime: 'file',
        attachments: [],
        dispose: serverDispose,
      }
    })
    expect((await run()).status).toBe('passed')
    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'production',
        distDir: '/application/custom-dist',
      })
    )
  })

  it('authorizes browser snapshot writes only after browser and server disposal', async () => {
    const compiled = useBrowserProject()
    compiled.sourceHash = 'compiled-source'
    const order: string[] = []
    browserDispose.mockImplementation(async () => {
      order.push('browser disposed')
    })
    serverDispose.mockImplementation(async () => {
      order.push('server disposed')
    })
    jest.mocked(commitSnapshotUpdates).mockImplementation(async () => {
      expect(browserDispose).toHaveBeenCalledTimes(1)
      expect(serverDispose).toHaveBeenCalledTimes(1)
      order.push('snapshots committed')
    })
    const originalExecute = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (input, options) => {
      await options.onSnapshotUpdates!(options.entry.file, [
        {
          path: '/application/__snapshots__/flow.spec.ts.snap',
          content: 'updated',
          previousContent: null,
        },
      ])
      return originalExecute(input, options)
    })

    expect(
      (
        await runTests('/application', [project], {
          signal: new AbortController().signal,
          write: jest.fn(),
          updateSnapshots: true,
        })
      ).status
    ).toBe('passed')
    expect(commitSnapshotUpdates).toHaveBeenCalledWith(
      project.entries[0].file,
      expect.any(Array),
      expect.objectContaining({ sourceHash: 'compiled-source' })
    )
    expect(order).toEqual([
      'browser disposed',
      'server disposed',
      'snapshots committed',
    ])
  })

  it('rejects production drivers without resolved absolute application output evidence', async () => {
    const compiled = useBrowserProject()
    ;(process.env as any).NODE_ENV = 'production'
    project.profile.mode = 'production'
    compiled.profile.mode = 'production'
    compiled.applicationServer = { mode: 'production', lockDistDir: true }
    expect((await run()).status).toBe('failed')
    expect(createServer).not.toHaveBeenCalled()
  })

  function useCoverageProject() {
    jest.mocked(capabilities.requireTestCapability).mockImplementation(() => {})
    const config = parseTestConfig({ projects: [{ name: 'node' }] }).projects[0]
    project = {
      ...config,
      entries: [
        {
          id: 'node:unit.spec.ts',
          file: '/application/unit.spec.ts',
          profile: config.profile,
        },
      ],
    }
    artifact = {
      version: 2,
      kind: 'node',
      entryId: project.entries[0].id,
      profile: { ...config.profile, environment: 'node' },
      revision: 'coverage-revision',
      rootDir: '/snapshots/coverage',
      entryPath: 'entry.js',
      files: ['entry.js'],
      diagnostics: [],
      coverage: { version: 1, scripts: [], sources: {} },
    }
    compile.mockResolvedValue(artifact)
  }

  it('awaits coverage remapping before artifact disposal and reports before run-end', async () => {
    useCoverageProject()
    const order: string[] = []
    jest.mocked(remapCoverage).mockImplementation(async (input) => {
      expect(dispose).not.toHaveBeenCalled()
      order.push('remapped')
      return {
        version: 1,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        errors: [],
        files: [],
      }
    })
    const originalExecute = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (input, options) => {
      await options.onCoverage!({
        version: 1,
        runId: options.runId,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        data: { version: 1, scripts: [] },
      })
      return originalExecute(input, options)
    })
    dispose.mockImplementation(async () => {
      order.push('disposed')
    })
    const events: any[] = []
    try {
      const result = await runTests('/application', [project], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        onEvent: (event) => events.push(event),
      })
      expect(result.status).toBe('passed')
      expect(order).toEqual(['remapped', 'disposed'])
      expect(compile.mock.calls[0][1].coverage).toEqual({
        version: 1,
        kind: 'node-line',
      })
      expect(events.at(-1).type).toBe('run-end')
      const attachments = events.filter((event) => event.type === 'attachment')
      expect(attachments.map((event) => event.attachment.name)).toEqual([
        'coverage.json',
        'coverage.txt',
      ])
      expect(
        JSON.parse(await readFile(attachments[0].attachment.path, 'utf8'))
          .complete
      ).toBe(true)
    } finally {
      for (const event of events.filter(
        (event) => event.type === 'attachment'
      )) {
        await rm(path.dirname(event.attachment.path), {
          recursive: true,
          force: true,
        })
      }
    }
  })

  it('keeps an interrupted coverage run cancelled and publishes no successful report', async () => {
    useCoverageProject()
    const controller = new AbortController()
    const events: any[] = []
    const originalExecute = executeFile.getMockImplementation()!
    jest.mocked(remapCoverage).mockImplementation(async (input) => {
      controller.abort(new Error('Interrupted during remap'))
      return {
        version: 1,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        errors: [],
        files: [],
      }
    })
    executeFile.mockImplementation(async (input, options) => {
      await options.onCoverage!({
        version: 1,
        runId: options.runId,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        data: { version: 1, scripts: [] },
      })
      return originalExecute(input, options)
    })
    const result = await runTests('/application', [project], {
      signal: controller.signal,
      write: () => {},
      coverage: true,
      onEvent: (event) => events.push(event),
    })
    expect(result.status).toBe('cancelled')
    expect(events.filter((event) => event.type === 'attachment')).toEqual([])
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects a coverage completion for another artifact revision before remapping', async () => {
    useCoverageProject()
    const events: any[] = []
    executeFile.mockImplementation(async (input, options) => {
      await options.onCoverage!({
        version: 1,
        runId: options.runId,
        entryId: input.entryId,
        revision: 'stale',
        complete: true,
        data: { version: 1, scripts: [] },
      })
      throw new Error('Must not accept stale capture')
    })
    try {
      const result = await runTests('/application', [project], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        onEvent: (event) => events.push(event),
      })
      expect(result.status).toBe('failed')
      expect(remapCoverage).not.toHaveBeenCalled()
      expect(
        events.some(
          (event) =>
            event.type === 'diagnostic' &&
            event.diagnostic.message.includes('Invalid or duplicate')
        )
      ).toBe(true)
    } finally {
      for (const event of events.filter(
        (event) => event.type === 'attachment'
      )) {
        await rm(path.dirname(event.attachment.path), {
          recursive: true,
          force: true,
        })
      }
    }
  })

  it('fails missing coverage completion instead of publishing a successful percentage', async () => {
    useCoverageProject()
    const events: any[] = []
    try {
      const result = await runTests('/application', [project], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        onEvent: (event) => events.push(event),
      })
      expect(result.status).toBe('failed')
      const reportEvent = events.find(
        (event) =>
          event.type === 'attachment' &&
          event.attachment.name === 'coverage.json'
      )
      const report = JSON.parse(
        await readFile(reportEvent.attachment.path, 'utf8')
      )
      expect(report.complete).toBe(false)
      expect(report.totals.percent).toBeNull()
      expect(remapCoverage).not.toHaveBeenCalled()
    } finally {
      for (const event of events.filter(
        (event) => event.type === 'attachment'
      )) {
        await rm(path.dirname(event.attachment.path), {
          recursive: true,
          force: true,
        })
      }
    }
  })

  it('reports compilation failure as a failed file and disposes the session', async () => {
    compile.mockRejectedValue(new Error('Invalid server-only boundary'))
    const write = jest.fn()
    const summary = await run(undefined, write)
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(write.mock.calls.flat().join('')).toContain('[compilation]')
    expect(write.mock.calls.flat().join('')).toContain('Failed Suites 1')
    expect(executeFile).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('forwards a Node artifact without manufacturing RSC manifests or request state', async () => {
    const [config] = parseTestConfig({
      projects: [{ name: 'node', environment: 'node' }],
    }).projects
    const entry = {
      id: 'node:unit.spec.ts',
      file: '/application/unit.spec.ts',
      profile: config.profile,
    }
    project = { ...config, entries: [entry] }
    artifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      profile: { ...entry.profile, environment: 'node' },
      revision: 'node-revision',
      rootDir: '/snapshots/node-revision',
      entryPath: 'entry.js',
      files: ['entry.js'],
      diagnostics: [],
    }
    compile.mockResolvedValue(artifact)
    expect((await run()).status).toBe('passed')
    expect(executeFile.mock.calls[0][0]).toBe(artifact)
    expect(executeFile.mock.calls[0][0]).not.toHaveProperty('manifests')
    expect(executeFile.mock.calls[0][0]).not.toHaveProperty('requestContext')
  })

  it('passes an explicitly extended file budget without silently capping long cases or hooks', async () => {
    const config = parseTestConfig({
      projects: [
        {
          name: 'rsc',
          environment: 'rsc',
          testTimeout: 300000,
          hookTimeout: 180000,
          fileTimeout: 600000,
        },
      ],
    })
    project = { ...config.projects[0], entries: project.entries }
    expect((await run()).status).toBe('passed')
    expect(executeFile).toHaveBeenCalledWith(
      artifact,
      expect.objectContaining({
        testTimeout: 300000,
        hookTimeout: 180000,
        fileTimeout: 600000,
      })
    )
  })

  it('never executes an artifact containing error diagnostics', async () => {
    artifact.diagnostics.push({
      phase: 'compilation',
      severity: 'error',
      message: 'Invalid artifact',
    })
    expect((await run()).status).toBe('failed')
    expect(executeFile).not.toHaveBeenCalled()
  })

  it('reports unsupported profile/session startup instead of a zero-file passing run', async () => {
    createSession.mockRejectedValue(
      new Error('Unsupported actual compilation profile')
    )
    const summary = await run()
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('reports executor exceptions and cleanup failures before run-end', async () => {
    executeFile.mockRejectedValue(new Error('Worker crashed'))
    dispose.mockRejectedValue(new Error('Snapshot removal failed'))
    const write = jest.fn()
    const events: ResultEvent[] = []
    const summary = await run(undefined, write, (event) => events.push(event))
    const output = write.mock.calls.flat().join('')
    expect(summary.status).toBe('failed')
    expect(summary.errors).toBe(2)
    expect(output).toContain('Snapshot removal failed')
    const failure = events.findIndex(
      (event) =>
        event.type === 'diagnostic' &&
        event.diagnostic.message === 'Snapshot removal failed'
    )
    expect(failure).toBeGreaterThan(-1)
    expect(failure).toBeLessThan(
      events.findIndex((event) => event.type === 'run-end')
    )
  })

  it('lets the reporter reject a claimed pass with a failed emitted case', async () => {
    executeFile.mockImplementation(async (input, options) => {
      const envelope = {
        version: 1 as const,
        runId: options.runId,
        timestamp: Date.now(),
      }
      options.onEvent({
        ...envelope,
        type: 'case-end',
        entryId: input.entryId,
        caseId: 'case',
        attempt: { id: 'case:0', retry: 0, repeat: 0 },
        name: 'fails',
        status: 'failed',
        durationMs: 1,
        errors: [],
      })
      return { entryId: input.entryId, status: 'passed', durationMs: 1 }
    })
    expect((await run()).status).toBe('failed')
  })

  it('waits for cancelled execution to close before releasing the artifact', async () => {
    const controller = new AbortController()
    let startedExecution!: () => void
    const executing = new Promise<void>((resolve) => {
      startedExecution = resolve
    })
    let closed = false
    executeFile.mockImplementation(async (input, options) => {
      startedExecution()
      await new Promise<void>((resolve) =>
        options.signal.addEventListener('abort', () => resolve(), {
          once: true,
        })
      )
      closed = true
      return { entryId: input.entryId, status: 'cancelled', durationMs: 1 }
    })
    dispose.mockImplementation(async () => {
      expect(closed).toBe(true)
    })
    const running = run(controller.signal)
    await executing
    controller.abort()
    expect((await running).status).toBe('cancelled')
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('aborts on reporter failure but still disposes acquired sessions', async () => {
    await expect(
      run(
        undefined,
        jest.fn(() => {
          if (createSession.mock.calls.length)
            throw new Error('Output stream failed')
        })
      )
    ).rejects.toThrow('Output stream failed')
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects mixed browser modes and NODE_ENV conflicts before compiler setup', async () => {
    const production = {
      ...project,
      profile: {
        ...project.profile,
        mode: 'production' as const,
        environment: 'browser' as const,
      },
    }
    const options = { signal: new AbortController().signal, write: jest.fn() }
    expect(
      (await runTests('/application', [project, production], options)).status
    ).toBe('failed')
    ;(process.env as any).NODE_ENV = 'test'
    expect((await run()).status).toBe('failed')
    expect(createSession).not.toHaveBeenCalled()
    expect(process.env.NODE_ENV).toBe('test')
  })

  it('bounds complete file leases and drains every worker before compiler disposal', async () => {
    project.entries = ['a', 'b', 'c', 'd', 'e'].map((name) => ({
      ...project.entries[0],
      id: `rsc:${name}`,
      file: `/application/${name}.tsx`,
    }))
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
    }))
    let active = 0
    let peak = 0
    let release!: () => void
    let reached!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const overlapped = new Promise<void>((resolve) => {
      reached = resolve
    })
    const original = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (...args) => {
      peak = Math.max(peak, ++active)
      if (active === 2) reached()
      await gate
      try {
        return await original(...args)
      } finally {
        active--
      }
    })
    dispose.mockImplementation(async () => {
      expect(active).toBe(0)
    })
    const running = runTests('/application', [project], {
      signal: new AbortController().signal,
      write: jest.fn(),
      maxWorkers: 2,
    })
    await overlapped
    expect(executeFile).toHaveBeenCalledTimes(2)
    expect(dispose).not.toHaveBeenCalled()
    release()
    expect((await running).status).toBe('passed')
    expect(peak).toBe(2)
    expect(
      executeFile.mock.calls.map(([, options]) => options.entry.id).sort()
    ).toEqual(project.entries.map((entry) => entry.id))
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('cancels active workers, leaves queued files unstarted, and reports all files once', async () => {
    project.entries = ['a', 'b', 'c'].map((name) => ({
      ...project.entries[0],
      id: `rsc:${name}`,
      file: `/application/${name}.tsx`,
    }))
    const controller = new AbortController()
    let reached!: () => void
    const active = new Promise<void>((resolve) => {
      reached = resolve
    })
    executeFile.mockImplementation(async (_, options) => {
      if (executeFile.mock.calls.length === 2) reached()
      await new Promise<void>((resolve) =>
        options.signal.addEventListener('abort', () => resolve(), {
          once: true,
        })
      )
      return { entryId: options.entry.id, status: 'cancelled', durationMs: 1 }
    })
    const events: ResultEvent[] = []
    const running = runTests('/application', [project], {
      signal: controller.signal,
      write: jest.fn(),
      maxWorkers: 2,
      onEvent: (event) => events.push(event),
    })
    await active
    controller.abort()
    expect((await running).status).toBe('cancelled')
    expect(executeFile).toHaveBeenCalledTimes(2)
    expect(
      events
        .filter((event) => event.type === 'file-end')
        .map((event) => event.entryId)
        .sort()
    ).toEqual(project.entries.map((entry) => entry.id))
  })

  it('runs mixed profiles in isolated serialized generations with one aggregate run identity', async () => {
    const production = {
      ...project,
      profile: { ...project.profile, id: 'prod', mode: 'production' as const },
    }
    production.entries = [
      {
        ...project.entries[0],
        id: 'prod:page.spec.tsx',
        profile: production.profile,
      },
    ]
    const events: ResultEvent[] = []
    jest
      .mocked(runWatchProcess)
      .mockImplementation(async (request, options) => {
        if (request.operation !== 'run') throw new Error('Expected run')
        expect(request.isolatedProfile).toBe(true)
        expect(request.maxWorkers).toBe(2)
        const entry = request.projects[0].entries[0]
        const envelope = {
          version: 1 as const,
          runId: entry.id,
          timestamp: Date.now(),
        }
        options.onEvent?.({ ...envelope, type: 'run-start' })
        options.onEvent?.({ ...envelope, type: 'file-start', entry })
        options.onEvent?.({
          ...envelope,
          type: 'file-end',
          entryId: entry.id,
          status: 'passed',
          durationMs: 1,
        })
        options.onEvent?.({
          ...envelope,
          type: 'run-end',
          status: 'passed',
          durationMs: 1,
        })
        return {
          operation: 'run',
          result: { status: 'passed', unsafeCleanup: false } as any,
        }
      })
    const result = await runTests('/application', [project, production], {
      signal: new AbortController().signal,
      write: jest.fn(),
      maxWorkers: 2,
      onEvent: (event) => events.push(event),
    })
    expect(result.status).toBe('passed')
    expect(
      jest
        .mocked(runWatchProcess)
        .mock.calls.map(
          ([request]) =>
            request.operation === 'run' && request.projects[0].profile.mode
        )
    ).toEqual(['development', 'production'])
    expect(new Set(events.map((event) => event.runId)).size).toBe(1)
    expect(events.filter((event) => event.type === 'run-end')).toHaveLength(1)
    expect(process.env.NODE_ENV).toBe('development')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('compiles all browser drivers before handing output ownership to per-file servers', async () => {
    useBrowserProject()
    project.entries.push({
      ...project.entries[0],
      id: 'browser:second.spec.ts',
      file: '/application/second.spec.ts',
    })
    const order: string[] = []
    compile.mockImplementation(async (entry) => {
      order.push(`compile ${entry.id}`)
      return { ...artifact, entryId: entry.id }
    })
    shutdownCompilation.mockImplementation(async () => {
      order.push('native shutdown')
    })
    const originalServer = createServer.getMockImplementation()!
    createServer.mockImplementation(async (options) => {
      order.push('server start')
      return originalServer(options)
    })
    const originalExecute = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (...args) => {
      const result = await originalExecute(...args)
      order.push('driver closed')
      return result
    })
    browserDispose.mockImplementation(async () => {
      order.push('browser disposed')
    })
    serverDispose.mockImplementation(async () => {
      order.push('server disposed')
    })
    dispose.mockImplementation(async () => {
      order.push('snapshots disposed')
    })
    expect((await run()).status).toBe('passed')
    expect(order).toEqual([
      'compile browser:flow.spec.ts',
      'compile browser:second.spec.ts',
      'native shutdown',
      'server start',
      'driver closed',
      'browser disposed',
      'server disposed',
      'server start',
      'driver closed',
      'browser disposed',
      'server disposed',
      'snapshots disposed',
    ])
    expect(shutdownCompilation).toHaveBeenCalledTimes(1)
    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: '/application',
        mode: 'development',
        outputLockEnabled: true,
      })
    )
    const browser = executeFile.mock.calls[0][1].browser!
    expect(browser).toMatchObject({
      baseURL: 'http://127.0.0.1:1234',
      wsEndpoint: 'ws://127.0.0.1/browser',
    })
    expect(path.isAbsolute(browser.outputDir)).toBe(true)
    expect(browser.outputDir).not.toBe(artifact.rootDir)
  })

  it.each([undefined, false])(
    'rejects missing or false resolved locking evidence before server acquisition (%s)',
    async (enabled) => {
      const compiled = useBrowserProject()
      if (enabled === undefined) delete compiled.applicationServer
      else compiled.applicationServer!.lockDistDir = enabled
      expect((await run()).status).toBe('failed')
      expect(createServer).not.toHaveBeenCalled()
      expect(createBrowser).not.toHaveBeenCalled()
      expect(executeFile).not.toHaveBeenCalled()
    }
  )

  it('does not start app servers if native graph shutdown fails', async () => {
    useBrowserProject()
    shutdownCompilation.mockRejectedValue(new Error('Native shutdown failed'))
    expect((await run()).status).toBe('failed')
    expect(createServer).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('retains startup-log attachments and disposes compiler snapshots on server failure', async () => {
    useBrowserProject()
    createServer.mockRejectedValue(
      new ApplicationServerError(
        [new Error('App startup failed')],
        [
          {
            name: 'Server log',
            kind: 'file',
            path: '/owned/server.log',
            contentType: 'text/plain',
          },
        ]
      )
    )
    const summary = await run()
    expect(summary.status).toBe('failed')
    expect(summary.attachments).toBe(1)
    expect(createBrowser).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes the app server after browser acquisition failure and preserves cleanup failure', async () => {
    useBrowserProject()
    createBrowser.mockRejectedValue(new Error('Chromium launch failed'))
    serverDispose.mockRejectedValue(new Error('Server cleanup failed'))
    const summary = await run()
    expect(summary.status).toBe('failed')
    expect(summary.errors).toBe(2)
    expect(serverDispose).toHaveBeenCalledTimes(1)
    expect(executeFile).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps browser/server leases until a cancelled driver closes and still attempts both disposals', async () => {
    useBrowserProject()
    const controller = new AbortController()
    let driverStarted!: () => void
    const startedDriver = new Promise<void>((resolve) => {
      driverStarted = resolve
    })
    let closed = false
    executeFile.mockImplementation(async (input, options) => {
      driverStarted()
      await new Promise<void>((resolve) =>
        options.signal.addEventListener('abort', () => resolve(), {
          once: true,
        })
      )
      expect(browserDispose).not.toHaveBeenCalled()
      expect(serverDispose).not.toHaveBeenCalled()
      closed = true
      return { entryId: input.entryId, status: 'cancelled', durationMs: 1 }
    })
    browserDispose.mockImplementation(async () => {
      expect(closed).toBe(true)
      throw new Error('Browser cleanup failed')
    })
    serverDispose.mockImplementation(async () => {
      expect(closed).toBe(true)
    })
    const running = run(controller.signal)
    await startedDriver
    controller.abort()
    const summary = await running
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(summary.files.cancelled).toBe(0)
    expect(browserDispose).toHaveBeenCalledTimes(1)
    expect(serverDispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('does not turn pure aggregated acquisition cancellation into a failure', async () => {
    useBrowserProject()
    const controller = new AbortController()
    createServer.mockImplementation(async () => {
      controller.abort()
      throw new ApplicationServerError([controller.signal.reason], [])
    })
    const summary = await run(controller.signal)
    expect(summary.status).toBe('cancelled')
    expect(summary.files.cancelled).toBe(1)
    expect(summary.files.failed).toBe(0)
    expect(createBrowser).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('does not acquire another app server after parent resource disposal fails', async () => {
    useBrowserProject()
    project.entries.push({
      ...project.entries[0],
      id: 'browser:second.spec.ts',
      file: '/application/second.spec.ts',
    })
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
    }))
    serverDispose.mockRejectedValue(new Error('Output owner disposal failed'))
    expect(await run()).toMatchObject({
      status: 'failed',
      unsafeCleanup: true,
    })
    expect(createServer).toHaveBeenCalledTimes(1)
    expect(executeFile).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('publishes browser success only after both parent disposals', async () => {
    useBrowserProject()
    const events: ResultEvent[] = []
    const assertNoFileEnd = () => {
      expect(events.some((event) => event.type === 'file-end')).toBe(false)
    }
    browserDispose.mockImplementation(async () => assertNoFileEnd())
    serverDispose.mockImplementation(async () => {
      expect(browserDispose).toHaveBeenCalledTimes(1)
      assertNoFileEnd()
    })
    const summary = await run(undefined, undefined, (event) =>
      events.push(event)
    )
    expect(summary.files.passed).toBe(1)
    expect(
      events.filter(
        (event) => event.type === 'file-end' && event.status === 'passed'
      )
    ).toHaveLength(1)
  })

  it.each(['missing', 'duplicate', 'failed'] as const)(
    'preserves a failed browser file for %s worker terminal events',
    async (terminal) => {
      useBrowserProject()
      executeFile.mockImplementation(async (input, options) => {
        const envelope = {
          version: 1 as const,
          runId: options.runId,
          timestamp: Date.now(),
        }
        options.onEvent({
          ...envelope,
          type: 'file-start',
          entry: options.entry,
        })
        const result = {
          entryId: input.entryId,
          status:
            terminal === 'failed' ? ('failed' as const) : ('passed' as const),
          durationMs: 1,
        }
        if (terminal !== 'missing')
          options.onEvent({ ...envelope, type: 'file-end', ...result })
        if (terminal === 'duplicate')
          options.onEvent({ ...envelope, type: 'file-end', ...result })
        return result
      })
      const write = jest.fn()
      const events: ResultEvent[] = []
      const summary = await run(undefined, write, (event) => events.push(event))
      expect(summary.status).toBe('failed')
      expect(summary.files.failed).toBe(1)
      expect(summary.files.passed).toBe(0)
      expect(
        events.filter(
          (event) => event.type === 'file-end' && event.status === 'failed'
        )
      ).toHaveLength(1)
      expect(serverDispose).toHaveBeenCalledTimes(1)
    }
  )

  it('seals one failed owning file after parent cleanup while retaining passed cases', async () => {
    useBrowserProject()
    executeFile.mockImplementation(async (input, options) => {
      const envelope = {
        version: 1 as const,
        runId: options.runId,
        timestamp: Date.now(),
      }
      options.onEvent({
        ...envelope,
        type: 'file-start',
        entry: options.entry,
        revision: input.revision,
      })
      options.onEvent({
        ...envelope,
        type: 'case-end',
        entryId: input.entryId,
        caseId: 'passed-case',
        attempt: { id: 'attempt-0', retry: 0, repeat: 0 },
        name: 'passed browser case',
        status: 'passed',
        durationMs: 1,
        errors: [],
      })
      const result = {
        entryId: input.entryId,
        status: 'passed' as const,
        durationMs: 1,
      }
      options.onEvent({ ...envelope, type: 'file-end', ...result })
      return result
    })
    serverDispose.mockRejectedValue(new Error('Parent server cleanup failed'))
    const write = jest.fn()
    const events: ResultEvent[] = []
    const summary = await run(undefined, write, (event) => events.push(event))
    expect(summary.status).toBe('failed')
    expect(summary.files).toEqual({
      passed: 0,
      failed: 1,
      skipped: 0,
      cancelled: 0,
    })
    expect(summary.cases.passed).toBe(1)
    expect(summary.attempts.passed).toBe(1)
    const endings = events.filter((event) => event.type === 'file-end')
    expect(endings).toHaveLength(1)
    expect(endings[0].status).toBe('failed')
    const failure = events.findIndex(
      (event) =>
        event.type === 'diagnostic' &&
        event.diagnostic.message === 'Parent server cleanup failed'
    )
    expect(failure).toBeGreaterThan(-1)
    expect(failure).toBeLessThan(events.indexOf(endings[0]))
    expect(browserDispose).toHaveBeenCalledTimes(1)
    expect(serverDispose).toHaveBeenCalledTimes(1)
  })

  it('stops after partial server acquisition with failed cleanup and retains both errors and logs', async () => {
    useBrowserProject()
    project.entries.push({
      ...project.entries[0],
      id: 'browser:second.spec.ts',
      file: '/application/second.spec.ts',
    })
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
    }))
    createServer.mockRejectedValue(
      new ApplicationServerError(
        [
          new Error('Startup failed'),
          new Error('Partial server cleanup failed'),
        ],
        [
          {
            name: 'Startup log',
            kind: 'file',
            path: '/owned/startup.log',
            contentType: 'text/plain',
          },
        ]
      )
    )
    const write = jest.fn()
    const summary = await run(undefined, write)
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(summary.attachments).toBe(1)
    expect(write.mock.calls.flat().join('')).toContain('Startup failed')
    expect(write.mock.calls.flat().join('')).toContain(
      'Partial server cleanup failed'
    )
    expect(createServer).toHaveBeenCalledTimes(1)
    expect(createBrowser).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it.each(['errors getter', 'array method', 'cycle', 'deep aggregate'])(
    'preserves failures during cancellation with hostile %s',
    async (kind) => {
      const controller = new AbortController()
      const failure = new Error('Original execution failure')
      if (kind === 'errors getter') {
        Object.defineProperty(failure, 'errors', {
          get() {
            throw new Error('Classification getter trap')
          },
        })
      } else if (kind === 'array method') {
        const errors = [new Error('Original child failure')]
        Object.defineProperty(errors, 'every', {
          get() {
            throw new Error('Classification array trap')
          },
        })
        Object.defineProperty(failure, 'errors', { value: errors })
      } else if (kind === 'cycle') {
        Object.defineProperty(failure, 'errors', { value: [failure] })
      } else {
        let nested: unknown = failure
        for (let index = 0; index < 200; index++) nested = { errors: [nested] }
        Object.defineProperty(failure, 'errors', { value: [nested] })
      }
      executeFile.mockImplementation(async () => {
        controller.abort()
        throw failure
      })
      const write = jest.fn()
      expect((await run(controller.signal, write)).status).toBe('failed')
      expect(write.mock.calls.flat().join('')).toContain(
        'Original execution failure'
      )
      expect(write.mock.calls.flat().join('')).not.toContain(
        'Classification getter trap'
      )
      expect(write.mock.calls.flat().join('')).not.toContain(
        'Classification array trap'
      )
      expect(dispose).toHaveBeenCalledTimes(1)
    }
  )
})

describe('interactive watch keyboard ownership', () => {
  let previousCI: string | undefined
  let previousTerm: string | undefined
  beforeEach(() => {
    previousCI = process.env.CI
    previousTerm = process.env.TERM
    delete process.env.CI
    delete process.env.TERM
  })
  afterEach(() => {
    if (previousCI === undefined) delete process.env.CI
    else process.env.CI = previousCI
    if (previousTerm === undefined) delete process.env.TERM
    else process.env.TERM = previousTerm
  })
  function terminal() {
    const { PassThrough } = require('stream') as typeof import('stream')
    const input = new PassThrough() as unknown as NodeJS.ReadStream
    Object.assign(input, {
      isTTY: true,
      isRaw: false,
      setRawMode: jest.fn((raw: boolean) => {
        input.isRaw = raw
        return input
      }),
    })
    input.pause()
    const output = {
      isTTY: true,
      write: jest.fn(),
    } as unknown as NodeJS.WriteStream
    return { input, output }
  }

  it('dispatches shortcuts and validated prompts, cancels busy runs, and restores input', () => {
    const { createWatchKeyboard } =
      require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
    const { input, output } = terminal()
    const onCommand = jest.fn()
    const onError = jest.fn()
    const onPromptChange = jest.fn()
    const priorListener = jest.fn()
    input.on('data', priorListener)
    input.pause()
    let busy = false
    const keyboard = createWatchKeyboard({
      input,
      output,
      onCommand,
      onError,
      onPromptChange,
      isRunning: () => busy,
    })
    input.emit('data', Buffer.from('rfau\r'))
    expect(onCommand.mock.calls.map(([command]) => command.type)).toEqual([
      'rerun',
      'failed',
      'all',
      'update',
      'all',
    ])
    input.emit('data', Buffer.from('pmath\r'))
    input.emit('data', Buffer.from('t[\r^works$\r'))
    expect(onCommand).toHaveBeenCalledWith({ type: 'files', value: 'math' })
    expect(onCommand).toHaveBeenCalledWith({ type: 'name', value: '^works$' })
    input.emit('data', Buffer.from('wignored\x03'))
    expect(onCommand).not.toHaveBeenCalledWith({
      type: 'project',
      value: 'ignored',
    })
    busy = true
    input.emit('data', Buffer.from('q'))
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'cancel' })
    input.emit('data', Buffer.from('\x03'))
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'interrupt' })
    keyboard.close()
    keyboard.close()
    expect(input.isRaw).toBe(false)
    expect(input.readableFlowing).toBe(false)
    expect(input.listeners('data')).toEqual([priorListener])
    expect(input.listenerCount('error')).toBe(0)
    expect(onPromptChange.mock.calls).toEqual([
      [true],
      [false],
      [true],
      [false],
      [true],
      [false],
    ])
    expect(onError).not.toHaveBeenCalled()
  })

  it('distinguishes split arrow keys from escape and releases prompt ownership', () => {
    jest.useFakeTimers()
    const { createWatchKeyboard } =
      require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
    const { input, output } = terminal()
    const onCommand = jest.fn()
    const onPromptChange = jest.fn()
    const keyboard = createWatchKeyboard({
      input,
      output,
      onCommand,
      onPromptChange,
      onError: jest.fn(),
    })
    try {
      input.emit('data', Buffer.from('\x1b'))
      input.emit('data', Buffer.from('[A'))
      jest.advanceTimersByTime(30)
      expect(onCommand).not.toHaveBeenCalled()
      input.emit('data', Buffer.from('pignored\x1b'))
      jest.advanceTimersByTime(30)
      expect(onPromptChange.mock.calls).toEqual([[true], [false]])
      expect(onCommand).not.toHaveBeenCalled()
      input.emit('data', Buffer.from('\x1b'))
      jest.advanceTimersByTime(30)
      expect(onCommand).toHaveBeenCalledWith({ type: 'interrupt' })
    } finally {
      keyboard.close()
      jest.useRealTimers()
    }
  })

  it.each(['CI', 'TERM'])(
    'does not capture input with %s disabling interaction',
    (name) => {
      const { createWatchKeyboard } =
        require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
      const { input, output } = terminal()
      process.env[name] = name === 'CI' ? 'true' : 'dumb'
      createWatchKeyboard({
        input,
        output,
        onCommand: jest.fn(),
        onError: jest.fn(),
      }).close()
      expect(input.setRawMode).not.toHaveBeenCalled()
      expect(input.listenerCount('data')).toBe(0)
    }
  )

  it('awaits cancelled run cleanup before a queued generation and stays watching', async () => {
    const { createWatchSession } =
      require('next/dist/experimental/testing/incremental/watch-session') as typeof import('next/dist/experimental/testing/incremental/watch-session')
    let began!: () => void
    const started = new Promise<void>((resolve) => {
      began = resolve
    })
    let release!: () => void
    const cleanup = new Promise<void>((resolve) => {
      release = resolve
    })
    let runs = 0
    const run = jest.fn(async ({ signal }: { signal: AbortSignal }) => {
      if (++runs === 1) {
        began()
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true })
        )
        await cleanup
        return { status: 'cancelled' as const }
      }
      return { status: 'passed' as const }
    })
    const onError = jest.fn()
    const session = createWatchSession({
      discover: async () => ({ entryIds: ['first'], discoveryRevision: '1' }),
      run,
      onError,
    })
    try {
      await started
      session.cancelCurrent()
      session.invalidate()
      session.invalidate()
      await Promise.resolve()
      expect(run).toHaveBeenCalledTimes(1)
      release()
      await session.waitForIdle()
      expect(run).toHaveBeenCalledTimes(2)
      expect(onError).not.toHaveBeenCalled()
      session.invalidate()
      await session.waitForIdle()
      expect(run).toHaveBeenCalledTimes(3)
    } finally {
      release()
      await session.close()
    }
  })

  it('retains failed file selections and applies snapshot write authority to one generation', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-keyboard-generations-')
    )
    const { input, output } = terminal()
    const controller = new AbortController()
    const close = jest.fn().mockResolvedValue(undefined)
    jest
      .mocked(watchTestFiles)
      .mockReset()
      .mockResolvedValue({
        close,
        update: jest.fn().mockResolvedValue(undefined),
      })
    type RunRequest = Extract<
      Parameters<typeof runWatchProcess>[0],
      { operation: 'run' }
    >
    const requests: RunRequest[] = []
    let statusReady: (() => void) | undefined
    const write = (text: string) => {
      if (
        text.includes('Waiting for file changes') ||
        text.includes('Watching for file changes')
      )
        statusReady?.()
    }
    const nextStatus = (count = 1) =>
      new Promise<void>((resolve) => {
        statusReady = () => {
          if (--count === 0) resolve()
        }
      })
    const changed = () =>
      jest.mocked(watchTestFiles).mock.calls[0][0].onChange({
        changed: [path.join(directory, 'first.spec.ts')],
        removed: [],
      })
    jest
      .mocked(runWatchProcess)
      .mockReset()
      .mockImplementation(async (request, runOptions) => {
        if (request.operation === 'metadata')
          return {
            operation: 'metadata',
            directories: { directories: [directory], outputDirectories: [] },
          }
        if (request.operation === 'plan')
          throw new Error('Unexpected planner request in watch control')
        requests.push(request)
        const failed = requests.length === 1
        for (const project of request.projects) {
          for (const entry of project.entries) {
            runOptions.onEvent?.({
              version: 1,
              timestamp: Date.now(),
              runId: 'mock',
              type: 'file-end',
              entryId: entry.id,
              status:
                failed && entry.file.endsWith('first.spec.ts')
                  ? 'failed'
                  : 'passed',
              durationMs: 1,
            })
          }
        }
        if (request.updateSnapshots) {
          runOptions.onSnapshotCommitStart?.()
          changed()
          runOptions.onSnapshotCommitEnd?.()
          // Native notifications may arrive after the final transaction callback.
          changed()
          expect(runOptions.signal.aborted).toBe(false)
        }
        const counts = {
          passed: failed ? 1 : 2,
          failed: failed ? 1 : 0,
          skipped: 0,
          cancelled: 0,
        }
        return {
          operation: 'run',
          result: {
            runId: 'mock',
            unsafeCleanup: false,
            status: failed ? 'failed' : 'passed',
            files: counts,
            cases: counts,
            attempts: counts,
            errors: 0,
            warnings: 0,
            attachments: 0,
          },
        }
      })
    let runningWatch: ReturnType<typeof watchTests> | undefined
    try {
      await writeFile(path.join(directory, 'first.spec.ts'), '')
      await writeFile(path.join(directory, 'second.spec.ts'), '')
      const first = nextStatus()
      runningWatch = watchTests(directory, {
        input,
        output,
        signal: controller.signal,
        write,
      })
      await first
      const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
      await settle()
      async function key(value: string) {
        const status = nextStatus()
        input.emit('data', Buffer.from(value))
        await status
        await settle()
      }
      await key('f')
      expect(
        requests
          .at(-1)!
          .projects.flatMap((project) =>
            project.entries.map((entry) => path.basename(entry.file))
          )
      ).toEqual(['first.spec.ts'])
      const changedStatus = nextStatus()
      changed()
      await changedStatus
      await settle()
      expect(
        requests
          .at(-1)!
          .projects.flatMap((project) =>
            project.entries.map((entry) => path.basename(entry.file))
          )
      ).toEqual(['first.spec.ts'])
      await key('a')
      await key('pfirst\r')
      await key('t^work\r')
      expect(requests.at(-1)!.testNamePattern).toBe('^work')
      expect(
        requests.at(-1)!.projects.flatMap((project) => project.entries)
      ).toHaveLength(1)
      await key('t\r')
      expect(requests.at(-1)!.testNamePattern).toBeUndefined()
      expect(
        requests.at(-1)!.projects.flatMap((project) => project.entries)
      ).toHaveLength(2)
      await key('wmissing-project\r')
      await key('w\r')
      await key('pno-such-file\r')
      await key('p\r')
      const snapshotStatuses = nextStatus(2)
      input.emit('data', Buffer.from('u'))
      await snapshotStatuses
      await settle()
      expect(
        requests.filter((request) => request.updateSnapshots)
      ).toHaveLength(1)
      expect(requests.at(-1)!.updateSnapshots).toBe(false)
      input.emit('data', Buffer.from('q'))
      expect(await runningWatch).toEqual({ status: 'passed' })
      expect(close).toHaveBeenCalledTimes(1)
      expect(input.isRaw).toBe(false)
    } finally {
      controller.abort()
      await runningWatch
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not capture piped input and restores raw mode after callback failure', () => {
    const { createWatchKeyboard } =
      require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
    const { input, output } = terminal()
    output.isTTY = false
    createWatchKeyboard({
      input,
      output,
      onCommand: jest.fn(),
      onError: jest.fn(),
    }).close()
    expect(input.setRawMode).not.toHaveBeenCalled()
    output.isTTY = true
    input.isRaw = true
    const failure = new Error('command failed')
    const onError = jest.fn()
    createWatchKeyboard({
      input,
      output,
      onCommand() {
        throw failure
      },
      onError,
    })
    input.emit('data', Buffer.from('r'))
    expect(onError).toHaveBeenCalledWith(failure)
    expect(input.isRaw).toBe(true)
    expect(input.listenerCount('data')).toBe(0)
    expect(input.listenerCount('end')).toBe(0)
  })
})

describe('Pinned configuration helper primitives', () => {
  it('preserves the shallow frozen defaults and shared public array/object identities', () => {
    expect(Object.isFrozen(configDefaults)).toBe(true)
    expect(configDefaults.clearMocks).toBe(true)
    expect(configDefaults.include).toBe(defaultInclude)
    expect(configDefaults.exclude).toBe(defaultExclude)
    expect(configDefaults.coverage).toBe(coverageConfigDefaults)
    expect(defaultInclude).toEqual(['**/*.{test,spec}.?(c|m)[jt]s?(x)'])
    expect(defaultExclude).toEqual(['**/node_modules/**', '**/.git/**'])
    expect(defaultBrowserPort).toBe(63315)
    expect(Object.isFrozen(defaultInclude)).toBe(false)
  })

  it('retains factory identities and rejects callback configuration merging', async () => {
    const factory = async () => ({ test: { name: 'project' } })
    expect(defineConfig(factory)).toBe(factory)
    expect(defineProject(factory)).toBe(factory)
    await expect(
      defineConfig(factory)({ command: 'serve', mode: 'test' })
    ).resolves.toEqual({ test: { name: 'project' } })
    expect(() => mergeConfig(factory as never, {})).toThrow(
      'Cannot merge config in form of callback'
    )
  })

  it('preserves override-first aliases, true externals and non-plain replacement values', () => {
    const replacement = new Date(0)
    const merged = mergeConfig(
      {
        resolve: { alias: [{ find: 'same', replacement: 'old' }] },
        ssr: { noExternal: true },
        nested: { old: true },
      },
      {
        resolve: { alias: [{ find: 'same', replacement: 'new' }] },
        ssr: { noExternal: ['package'] },
        nested: replacement,
      }
    )
    expect(merged).toMatchObject({
      resolve: {
        alias: [
          { find: 'same', replacement: 'new' },
          { find: 'same', replacement: 'old' },
        ],
      },
      ssr: { noExternal: true },
    })
    expect(merged.nested).toBe(replacement)
  })
})

describe('Node watch machine generations', () => {
  let directory: string
  let controller: AbortController
  let watching: ReturnType<typeof watchTests> | undefined
  let runNumber: number
  let hold: (() => Promise<void>) | undefined
  const requests: Extract<
    Parameters<typeof runWatchProcess>[0],
    { operation: 'run' }
  >[] = []

  beforeEach(async () => {
    directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-machine-')
    )
    controller = new AbortController()
    watching = undefined
    runNumber = 0
    hold = undefined
    requests.length = 0
    await writeFile(path.join(directory, 'first.spec.ts'), '')
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({ maxWorkers: 2, projects: [{ name: 'node' }] })
    )
    jest
      .mocked(watchTestFiles)
      .mockReset()
      .mockResolvedValue({
        close: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      })
    jest
      .mocked(runWatchProcess)
      .mockReset()
      .mockImplementation(async (request, options) => {
        if (request.operation === 'metadata')
          return {
            operation: 'metadata',
            directories: { directories: [directory], outputDirectories: [] },
          }
        if (request.operation === 'plan')
          throw new Error('Unexpected planner request in watch control')
        requests.push(request)
        const current = ++runNumber
        const envelope = {
          version: 1 as const,
          runId: `watch-${current}`,
          timestamp: Date.now(),
        }
        const selected = request.projects.flatMap((project) => project.entries)
        const counts = {
          passed: selected.length,
          failed: 0,
          skipped: 0,
          cancelled: 0,
        }
        options.onEvent?.({ ...envelope, type: 'run-start' })
        for (const entry of selected) {
          options.onEvent?.({ ...envelope, type: 'file-start', entry })
          options.onEvent?.({
            ...envelope,
            type: 'case-end',
            entryId: entry.id,
            caseId: `${entry.id}/case`,
            attempt: { id: `${entry.id}/${current}`, retry: 0, repeat: 0 },
            name: `generation ${current}`,
            status: 'passed',
            durationMs: 1,
            errors: [],
          })
          options.onEvent?.({
            ...envelope,
            type: 'file-end',
            entryId: entry.id,
            status: 'passed',
            durationMs: 1,
          })
        }
        options.onEvent?.({
          ...envelope,
          type: 'run-end',
          status: 'passed',
          durationMs: 1,
        })
        await hold?.()
        options.signal.throwIfAborted()
        return {
          operation: 'run',
          result: {
            runId: envelope.runId,
            status: 'passed',
            files: counts,
            cases: counts,
            attempts: counts,
            errors: 0,
            warnings: 0,
            attachments: 0,
            unsafeCleanup: false,
          },
        }
      })
  })

  afterEach(async () => {
    controller.abort(new Error('Watch unit finished'))
    await watching
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  function start(outputFile = 'result.json') {
    watching = watchTests(directory, {
      signal: controller.signal,
      write: jest.fn(),
      resultReporters: ['json'],
      outputFile,
    })
  }
  function invalidate() {
    jest
      .mocked(watchTestFiles)
      .mock.calls[0][0].onChange({ changed: [directory], removed: [] })
  }
  async function report() {
    return JSON.parse(
      await readFile(path.join(directory, 'result.json'), 'utf8')
    )
  }
  async function expectGeneration(id: string) {
    await retry(
      async () => {
        expect((await report()).next.events[0].runId).toBe(id)
      },
      5000,
      10
    )
  }

  it('replaces each cleaned generation and reloads configuration controls without mixing run identities', async () => {
    start()
    await expectGeneration('watch-1')
    expect(requests[0].maxWorkers).toBe(2)
    expect(
      jest.mocked(watchTestFiles).mock.calls[0][0].outputDirectories
    ).toContain(path.join(directory, '.next-test-snapshot-journals'))
    expect(jest.mocked(watchTestFiles).mock.calls[0][0].outputFiles).toContain(
      path.join(directory, 'result.json')
    )
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 3,
        testNamePattern: 'excluded',
        projects: [{ name: 'node' }],
      })
    )
    invalidate()
    await expectGeneration('watch-2')
    expect(requests[1].maxWorkers).toBe(3)
    expect(requests[1].projects[0].testNamePattern).toBe('excluded')
    expect(
      (await report()).testResults[0].assertionResults.map(
        (test: { title: string }) => test.title
      )
    ).toEqual(['generation 2'])
    expect(
      (await report()).next.events.every(
        (event: ResultEvent) => event.runId === 'watch-2'
      )
    ).toBe(true)
  })

  it('waits past the terminal event for authoritative cleanup and does not publish superseded results', async () => {
    start()
    await expectGeneration('watch-1')
    const first = await readFile(path.join(directory, 'result.json'), 'utf8')
    let began!: () => void
    const started = new Promise<void>((resolve) => {
      began = resolve
    })
    let release!: () => void
    const cleanup = new Promise<void>((resolve) => {
      release = resolve
    })
    hold = async () => {
      began()
      await cleanup
    }
    invalidate()
    await started
    expect(await readFile(path.join(directory, 'result.json'), 'utf8')).toBe(
      first
    )
    invalidate()
    hold = undefined
    release()
    await expectGeneration('watch-3')
    expect(
      (await report()).next.events.some(
        (event: ResultEvent) => event.runId === 'watch-2'
      )
    ).toBe(false)
  })

  it('replaces stale results after the final file is deleted without compiling an empty selection', async () => {
    start()
    await expectGeneration('watch-1')
    await rm(path.join(directory, 'first.spec.ts'))
    invalidate()
    await retry(
      async () => {
        expect(await report()).toMatchObject({
          numTotalTests: 0,
          numPassedTests: 0,
          success: false,
          testResults: [],
        })
      },
      5000,
      10
    )
    expect(requests).toHaveLength(1)
  })

  it('keeps report publication failures visible and fails the watch session', async () => {
    await mkdir(path.join(directory, 'blocked.json'))
    const writeError = jest.fn()
    watching = watchTests(directory, {
      signal: controller.signal,
      write: jest.fn(),
      writeError,
      resultReporters: ['json'],
      outputFile: 'blocked.json',
    })
    expect(await watching).toEqual({ status: 'failed' })
    expect(writeError.mock.calls.flat().join('')).toContain('Test watch error:')
    expect(requests).toHaveLength(1)
  })

  it('does not publish a passing result after a terminal-event observer fails', async () => {
    const writeError = jest.fn()
    watching = watchTests(directory, {
      signal: controller.signal,
      write: jest.fn(),
      writeError,
      resultReporters: ['json'],
      outputFile: 'result.json',
      onEvent(event) {
        if (event.type === 'run-end')
          throw new Error('terminal observer failed')
      },
    })
    expect(await watching).toEqual({ status: 'failed' })
    await expect(
      readFile(path.join(directory, 'result.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(writeError.mock.calls.flat().join('')).toContain(
      'terminal observer failed'
    )
  })
})

describe('Next-owned TypeScript type-test checking', () => {
  async function consumer(source: string, compiler?: string) {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-type-test-'))
    )
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}')
    if (compiler === undefined) {
      await symlink(
        path.resolve(__dirname, '../../../node_modules'),
        path.join(root, 'node_modules')
      )
    } else {
      await mkdir(path.join(root, 'node_modules/typescript'), {
        recursive: true,
      })
      await writeFile(
        path.join(root, 'node_modules/typescript/package.json'),
        '{"main":"index.cjs"}'
      )
      await writeFile(
        path.join(root, 'node_modules/typescript/index.cjs'),
        compiler
      )
    }
    await writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          module: 'ESNext',
          target: 'ESNext',
          moduleResolution: 'bundler',
          types: [],
        },
        include: ['*.ts'],
      })
    )
    const file = path.join(root, 'contract.test-d.ts')
    await writeFile(file, source)
    const config = parseTestConfig({
      projects: [
        {
          name: 'types',
          include: ['*.case.mjs'],
          typecheck: { enabled: true },
        },
      ],
    })
    const [project] = await discoverTests(root, config)
    return { root, file, project }
  }

  it('discovers configured type tests independently and honors CLI overrides', async () => {
    const owned = await consumer(
      "import {test} from 'vitest';test('type',()=>{})"
    )
    try {
      await writeFile(
        path.join(owned.root, 'runtime.case.mjs'),
        "throw new Error('discovery does not evaluate')"
      )
      const config = normalizeTestConfig({
        test: {
          include: ['*.case.mjs'],
          typecheck: { enabled: true, only: true, include: ['*.test-d.ts'] },
        },
      })
      expect((await discoverTests(owned.root, config))[0].entries).toHaveLength(
        1
      )
      const overridden = applyTestConfigOverrides(config, {
        typecheck: { enabled: false, only: false },
      })
      const selected = (await discoverTests(owned.root, overridden))[0].entries
      expect(selected.map((entry) => path.basename(entry.file))).toEqual([
        'runtime.case.mjs',
      ])
      expect(selected[0].typecheck).toBeUndefined()
      expect(() =>
        parseTestTypecheckConfig({ checker: 'vue-tsc' }, 'typecheck')
      ).toThrow('typecheck.checker')
      expect(() =>
        parseTestTypecheckConfig({ build: true }, 'typecheck')
      ).toThrow('typecheck.build')
      expect(() =>
        parseTestTypecheckConfig({ enabled: 'true' }, 'typecheck')
      ).toThrow('must be a boolean')
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  })

  it('attributes real TypeScript diagnostics to original spans without executing callbacks', async () => {
    const source = await readFile(
      path.resolve(
        __dirname,
        '../app-dir/next-testing-stable-release-gaps/fixtures/compiler-backed-typecheck/contract.test-d.ts'
      ),
      'utf8'
    )
    const owned = await consumer(source)
    try {
      const result = await runTypecheckProject(owned.root, owned.project, {
        signal: new AbortController().signal,
      })
      expect(result.files[0].cases).toHaveLength(1)
      expect(result.files[0].cases[0]).toMatchObject({
        status: 'failed',
        testName: 'type mismatch is a failed test',
        ancestors: [{ name: 'contract.test-d.ts' }],
        errors: [
          {
            name: 'TypeCheckError',
            location: { file: owned.file, line: 3, column: 40 },
          },
        ],
      })
      expect(result.files[0].cases[0].errors[0].message).toContain('Expected')
      await writeFile(
        owned.file,
        "import {test,expectTypeOf} from 'vitest';test('valid',()=>{expectTypeOf<number>().toEqualTypeOf<number>();throw new Error('type-test callback executed')})"
      )
      const passing = await runTypecheckProject(owned.root, owned.project, {
        signal: new AbortController().signal,
      })
      expect(passing.files[0].status).toBe('passed')
      expect(passing.files[0].cases[0].status).toBe('passed')
      expect(passing.sourceErrors).toEqual([])
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  })

  it('retains outside-test and source diagnostics without inventing failed cases', async () => {
    const owned = await consumer(
      "import {test} from 'vitest';import './subject';const bad:string=42;test('valid',()=>{})"
    )
    try {
      await writeFile(
        path.join(owned.root, 'subject.ts'),
        'export const badSource: number = "wrong"'
      )
      const result = await runTypecheckProject(owned.root, owned.project, {
        signal: new AbortController().signal,
      })
      expect(result.files[0].status).toBe('failed')
      expect(result.files[0].cases.map((test) => test.status)).toEqual([
        'passed',
      ])
      expect(result.files[0].errors).toHaveLength(1)
      expect(result.sourceErrors).toHaveLength(1)
      expect(result.sourceErrors[0].location.file).toBe(
        path.join(owned.root, 'subject.ts')
      )
      owned.project.typecheck.ignoreSourceErrors = true
      const ignored = await runTypecheckProject(owned.root, owned.project, {
        signal: new AbortController().signal,
      })
      expect(ignored.sourceErrors).toEqual([])
      expect(ignored.files[0].errors).toHaveLength(1)
      expect(ignored.files[0].status).toBe('failed')
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  })

  it('preserves type-test nesting, skip modes and pinned typechecker name filters', async () => {
    const owned = await consumer(
      "import {test,describe,expectTypeOf} from 'vitest';describe('outer',()=>{test('valid',()=>expectTypeOf<number>().toEqualTypeOf<number>());test('invalid',()=>expectTypeOf<string>().toEqualTypeOf<number>());test.skip('skipped',()=>expectTypeOf<string>().toEqualTypeOf<number>())})"
    )
    try {
      const result = await runTypecheckProject(owned.root, owned.project, {
        signal: new AbortController().signal,
      })
      expect(result.files[0].cases.map((test) => test.status)).toEqual([
        'passed',
        'failed',
        'skipped',
      ])
      expect(
        result.files[0].cases[1].ancestors.map((suite) => suite.name)
      ).toEqual(['contract.test-d.ts', 'outer'])
      const filtered = await runTypecheckProject(owned.root, owned.project, {
        signal: new AbortController().signal,
        testNamePattern: ' valid$',
      })
      expect(filtered.files[0].cases.map((test) => test.status)).toEqual([
        'passed',
        'failed',
        'skipped',
      ])
      expect(filtered.files[0].status).toBe('failed')
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  })

  it('rejects foreign, duplicate and failure-suppressing typechecker completion', async () => {
    const owned = await consumer(
      "import {test,expectTypeOf} from 'vitest';test('invalid',()=>expectTypeOf<string>().toEqualTypeOf<number>())"
    )
    try {
      const result = await runTypecheckProject(owned.root, owned.project, {
        signal: new AbortController().signal,
      })
      for (const corrupt of [
        (value) => value.files.push(value.files[0]),
        (value) => {
          value.files[0].entryId = 'foreign'
        },
        (value) => {
          value.files[0].revision = 'foreign'
        },
        (value) => {
          value.files[0].cases[0].attempt.id = 'foreign'
        },
        (value) => {
          value.files[0].status = 'passed'
        },
      ]) {
        const invalid = structuredClone(result)
        corrupt(invalid)
        expect(() =>
          assertTypecheckCompletion(invalid, owned.project)
        ).toThrow()
      }
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  })

  it('rejects a selected type-test file excluded from the actual TypeScript program', async () => {
    const owned = await consumer(
      "import {test,expectTypeOf} from 'vitest';test('invalid',()=>expectTypeOf<string>().toEqualTypeOf<number>())"
    )
    try {
      await writeFile(
        path.join(owned.root, 'other.ts'),
        'export const other = 1'
      )
      await writeFile(
        path.join(owned.root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { strict: true, noEmit: true, types: [] },
          files: ['other.ts'],
          include: [],
        })
      )
      await expect(
        runTypecheckProject(owned.root, owned.project, {
          signal: new AbortController().signal,
        })
      ).rejects.toThrow('not included in the TypeScript program')
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  })

  it('vetoes source edits during actual typechecker process cleanup', async () => {
    const actual = require.resolve('typescript')
    const compiler = `const fs=require('fs');const ts=require(${JSON.stringify(actual)});module.exports={...ts,createProgram(...args){const program=ts.createProgram(...args);fs.writeFileSync('compiler-ready',String(process.pid));const retained=setInterval(()=>{if(fs.existsSync('release-exit'))clearInterval(retained)},10);return program}}`
    const owned = await consumer(
      "import {test,expectTypeOf} from 'vitest';test('valid',()=>expectTypeOf<number>().toEqualTypeOf<number>())",
      compiler
    )
    const controller = new AbortController()
    const result = runTypecheckProject(owned.root, owned.project, {
      signal: controller.signal,
    }).then(
      () => null,
      (error) => error
    )
    let pid: number
    try {
      await retry(async () => {
        pid = Number(
          await readFile(path.join(owned.root, 'compiler-ready'), 'utf8')
        )
        expect(pid).toBeGreaterThan(0)
      })
      await writeFile(
        owned.file,
        (await readFile(owned.file, 'utf8')) +
          '\n// edited while the checker owns its original Program\n'
      )
      await writeFile(path.join(owned.root, 'release-exit'), '')
      const error = await result
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain(
        'source changed before authoritative completion'
      )
      expect(() => process.kill(pid, 0)).toThrow()
    } finally {
      controller.abort()
      await result
      await rm(owned.root, { recursive: true, force: true })
    }
  })

  it.each(['cancel', 'deadline'])(
    'reclaims an actually busy TypeScript compiler after %s',
    async (reason) => {
      const actual = require.resolve('typescript')
      const compiler = `const fs=require('fs');const ts=require(${JSON.stringify(actual)});fs.writeFileSync('compiler-pid',String(process.pid));module.exports={...ts,createProgram(){while(true){}}}`
      const owned = await consumer(
        "import {test} from 'vitest';test('valid',()=>{})",
        compiler
      )
      const controller = new AbortController()
      owned.project.fileTimeout = 1000
      const result = runTypecheckProject(owned.root, owned.project, {
        signal: controller.signal,
      }).then(
        () => null,
        (error) => error
      )
      let pid: number
      try {
        await retry(async () => {
          pid = Number(
            await readFile(path.join(owned.root, 'compiler-pid'), 'utf8')
          )
          expect(pid).toBeGreaterThan(0)
        })
        if (reason === 'cancel')
          controller.abort(new Error('owned typechecker cancelled'))
        const error = await result
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain(
          reason === 'cancel' ? 'owned typechecker cancelled' : 'fileTimeout'
        )
        expect(() => process.kill(pid, 0)).toThrow()
      } finally {
        controller.abort()
        await result
        await rm(owned.root, { recursive: true, force: true })
      }
    }
  )

  it.each(['before completion', 'after completion'])(
    'vetoes typechecker process failure %s',
    async (phase) => {
      const compiler =
        phase === 'before completion'
          ? 'process.exit(13)'
          : `module.exports=require(${JSON.stringify(require.resolve('typescript'))});process.exitCode=17`
      const owned = await consumer(
        "import {test} from 'vitest';test('valid',()=>{})",
        compiler
      )
      try {
        await expect(
          runTypecheckProject(owned.root, owned.project, {
            signal: new AbortController().signal,
          })
        ).rejects.toThrow('did not exit cleanly')
      } finally {
        await rm(owned.root, { recursive: true, force: true })
      }
    }
  )
})

describe('Next-owned in-source test discovery', () => {
  it('discovers marked includeSource entries without evaluating source modules', async () => {
    const directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-in-source-'))
    )
    try {
      const original = await readFile(
        path.resolve(
          __dirname,
          '../app-dir/next-testing-stable-release-gaps/fixtures/in-source-tests/subject.source.mjs'
        ),
        'utf8'
      )
      await writeFile(path.join(directory, 'subject.source.mjs'), original)
      await writeFile(
        path.join(directory, 'unmarked.source.mjs'),
        "throw new Error('must not evaluate')"
      )
      await writeFile(path.join(directory, 'excluded.source.mjs'), original)
      await writeFile(
        path.join(directory, 'control.case.mjs'),
        "throw new Error('must not evaluate')"
      )
      const config = normalizeTestConfig({
        test: {
          include: ['*.case.mjs'],
          includeSource: ['*.source.mjs'],
          exclude: ['excluded.*'],
        },
      })
      const [project] = await discoverTests(directory, config)
      expect(
        project.entries.map((entry) => ({
          file: path.basename(entry.file),
          inSource: entry.inSource,
        }))
      ).toEqual([
        { file: 'control.case.mjs', inSource: undefined },
        { file: 'subject.source.mjs', inSource: true },
      ])
      expect(
        await readFile(path.join(directory, 'subject.source.mjs'), 'utf8')
      ).toBe(original)
      expect(project.entries[1].inSourceHash).toBe(
        createHash('sha256').update(original).digest('hex')
      )
      const [filtered] = await discoverTests(directory, config, {
        files: ['subject'],
      })
      expect(filtered.entries).toEqual([project.entries[1]])
      const overlap = normalizeTestConfig({
        test: {
          include: ['subject.source.mjs'],
          includeSource: ['subject.source.mjs'],
        },
      })
      expect((await discoverTests(directory, overlap))[0].entries).toHaveLength(
        1
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requests native marker support for ordinary included specs without includeSource', async () => {
    const directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-ordinary-marker-'))
    )
    try {
      const source = await readFile(
        path.resolve(
          __dirname,
          '../app-dir/next-testing-stable-release-gaps/fixtures/in-source-tests/subject.source.mjs'
        )
      )
      await writeFile(path.join(directory, 'ordinary.case.mjs'), source)
      const [project] = await discoverTests(
        directory,
        normalizeTestConfig({ test: { include: ['*.case.mjs'] } })
      )
      expect(project.entries).toHaveLength(1)
      expect(project.entries[0].inSource).toBe(true)
      expect(project.entries[0].inSourceHash).toBe(
        createHash('sha256').update(source).digest('hex')
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    'import.meta /* comment */ .vitest',
    'import.meta. vitest',
    'import /* comment */ . meta . vitest',
    'import.meta.\\u0076itest',
  ])(
    'structurally detects the ordinary marker %s without broadening includeSource discovery',
    async (marker) => {
      const directory = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'next-structural-marker-'))
      )
      try {
        const source = `if (${marker}) { const {test}= ${marker};test('original',()=>{}) }`
        await writeFile(path.join(directory, 'ordinary.case.mjs'), source)
        await writeFile(path.join(directory, 'only.source.mjs'), source)
        const [project] = await discoverTests(
          directory,
          normalizeTestConfig({
            test: { include: ['*.case.mjs'], includeSource: ['*.source.mjs'] },
          })
        )
        expect(project.entries).toHaveLength(1)
        expect(project.entries[0].file).toBe(
          path.join(directory, 'ordinary.case.mjs')
        )
        expect(project.entries[0].inSource).toBe(true)
        expect(project.entries[0].inSourceHash).toBe(
          createHash('sha256').update(source).digest('hex')
        )
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it.each([
    '(import.meta).vitest',
    '((import.meta)).vitest',
    '(import.meta as any).vitest',
    'import.meta!.vitest',
    'import.meta?.vitest',
  ])('fails closed for unqualified wrapped marker %s', (marker) => {
    expect(() =>
      usesInSourceTestMarker(`if(${marker}){}`, 'ordinary.ts')
    ).toThrow('remains unqualified')
  })
  it('rejects unsupported wrappers even when a supported marker occurs in the same file', () => {
    expect(() =>
      usesInSourceTestMarker(
        'if((import.meta).vitest){};if(import.meta.vitest){}',
        'ordinary.mjs'
      )
    ).toThrow('remains unqualified')
    expect(() =>
      usesInSourceTestMarker(
        'if(import.meta.vitest){};if((import.meta).vitest){}',
        'ordinary.mjs'
      )
    ).toThrow('remains unqualified')
  })

  it('leaves an ordinary computed metadata key named vitest unchanged', () => {
    expect(
      usesInSourceTestMarker(
        `const vitest='url';console.log(import.meta[vitest])`,
        'ordinary.mjs'
      )
    ).toBe(false)
    expect(
      usesInSourceTestMarker(
        `const vitest='url';console.log((import.meta)[vitest])`,
        'ordinary.mjs'
      )
    ).toBe(false)
  })

  it('preserves support for parentheses around the whole direct marker', () => {
    expect(
      usesInSourceTestMarker('if((import.meta.vitest)){}', 'ordinary.mjs')
    ).toBe(true)
  })

  it('ignores marker strings, comments and unrelated meta properties while failing closed on syntax errors', () => {
    expect(
      usesInSourceTestMarker(
        `export const text='import.meta.vitest';/* import.meta.vitest */export const url=import.meta.url`,
        'ordinary.mjs'
      )
    ).toBe(false)
    expect(
      usesInSourceTestMarker(
        `const typed: number=42;if(import.meta /*c*/ .vitest){}`,
        'ordinary.ts'
      )
    ).toBe(true)
    expect(() =>
      usesInSourceTestMarker('if(import.meta. vitest){', 'ordinary.mjs')
    ).toThrow('Cannot determine in-source test marker')
  })

  it('requires Node in-source profiles and validates includeSource while preserving empty settings', () => {
    expect(() =>
      normalizeTestConfig({ test: { includeSource: 'subject.mjs' } })
    ).toThrow('array of nonempty strings')
    expect(() =>
      normalizeTestConfig({
        test: { environment: 'rsc', includeSource: ['*.mjs'] },
      })
    ).toThrow('fresh Node file profile')
    expect(
      normalizeTestConfig({ test: { environment: 'rsc', includeSource: [] } })
        .projects[0].includeSource
    ).toEqual([])
  })

  it.each(['client', 'node', 'edge'])(
    'defines the ordinary %s marker as false before production tracing',
    async (environment) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'next-define-marker-')
      )
      try {
        const config = await loadConfig(PHASE_PRODUCTION_BUILD, directory)
        const options = {
          isTurbopack: true,
          clientRouterFilters: undefined,
          config,
          dev: false,
          distDir: '.next',
          projectPath: directory,
          fetchCacheKeyPrefix: undefined,
          hasRewrites: false,
          isClient: environment === 'client',
          isNodeServer: environment === 'node',
          isEdgeServer: environment === 'edge',
          middlewareMatchers: undefined,
          rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
        }
        expect(getDefineEnv(options)['import.meta.vitest']).toBe('false')
        expect(
          getDefineEnv({
            ...options,
            config: {
              ...config,
              compiler: { define: { 'import.meta.vitest': false } },
            },
          })['import.meta.vitest']
        ).toBe('false')
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )
})

describe('real execution environment selection', () => {
  it('keeps DOM execution options separate from the compiler profile', () => {
    for (const name of ['jsdom', 'happy-dom', './environment.mjs']) {
      const [project] = parseTestConfig({
        projects: [
          {
            name: 'realm',
            environment: name,
            environmentOptions: { option: 42 },
          },
        ],
      }).projects
      expect(project.profile.environment).toBe('node')
      expect(project.executionEnvironment).toEqual({
        name,
        options: { option: 42 },
      })
    }
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'realm',
            environment: 'jsdom',
            environmentOptions: { callback() {} },
          },
        ],
      })
    ).toThrow('serializable')
  })

  it('resolves leading file pragmas before compilation without evaluating typecheck entries', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'next-environment-discovery-')
    )
    try {
      await writeFile(
        path.join(root, 'dom.test.ts'),
        '// @vitest-environment jsdom\n// @vitest-environment-options {"url":"https://file.example/"}\nthrow new Error("never evaluated")'
      )
      await writeFile(
        path.join(root, 'node.test.ts'),
        'const text = "@vitest-environment happy-dom"'
      )
      await writeFile(
        path.join(root, 'compile.test-d.ts'),
        '// @vitest-environment invalid-realm\nthrow new Error("typecheck is never evaluated")'
      )
      const [project] = await discoverTests(
        root,
        parseTestConfig({
          projects: [{ name: 'realm', typecheck: { enabled: true } }],
        })
      )
      const dom = project.entries.find((entry) =>
        entry.file.endsWith('dom.test.ts')
      )!
      expect(dom.profile.environment).toBe('node')
      expect(dom.executionEnvironment).toEqual({
        name: 'jsdom',
        options: { jsdom: { url: 'https://file.example/' } },
      })
      expect(dom.environmentSourceHash).toMatch(/^[a-f0-9]{64}$/)
      expect(
        project.entries.find((entry) => entry.file.endsWith('node.test.ts'))!
          .executionEnvironment
      ).toBeUndefined()
      const typecheck = project.entries.find((entry) => entry.typecheck)!
      expect(typecheck.executionEnvironment).toBeUndefined()
      expect(typecheck.environmentSourceHash).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('owned read-only editor discovery API', () => {
  it('accepts explicit decimal ports and an actual ephemeral port', async () => {
    const { parseEditorApiPort } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    expect(parseEditorApiPort(true)).toBe(51204)
    expect(parseEditorApiPort('0')).toBe(0)
    expect(parseEditorApiPort('65535')).toBe(65535)
    for (const value of ['', '-1', '65536', '1.5', '0x10', ' 1', '01'])
      expect(() => parseEditorApiPort(value)).toThrow('decimal port')
  })

  it('serves selected files and real observed identities, rejects writes and foreign origins, and closes owned sockets', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const { request } = await import('node:http')
    const entry = {
      id: 'project:case',
      file: '/selected/contract.case.mjs',
      profile: {
        id: 'project',
        environment: 'node' as const,
        mode: 'development' as const,
        runtime: 'nodejs' as const,
        bundler: 'turbopack' as const,
      },
    }
    const api = await openTestDiscoveryApi('/selected', [entry], 0)
    async function read(
      options: {
        method?: string
        headers?: Record<string, string>
        path?: string
      } = {}
    ) {
      return new Promise<{ code: number; text: string; headers: object }>(
        (resolve, reject) => {
          const outgoing = request(api.url, options, (response) => {
            let text = ''
            response.setEncoding('utf8')
            response.on('data', (chunk) => {
              text += chunk
            })
            response.once('end', () =>
              resolve({
                code: response.statusCode!,
                text,
                headers: response.headers,
              })
            )
            response.once('error', reject)
          })
          outgoing.once('error', reject)
          outgoing.end()
        }
      )
    }
    const envelope = {
      version: 1 as const,
      runId: 'actual-parent-run',
      timestamp: 1,
    }
    try {
      expect(api.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1\/discovery$/)
      const initial = await read()
      expect(initial.code).toBe(200)
      expect(JSON.parse(initial.text)).toMatchObject({
        version: 1,
        protocol: 'next-test-discovery',
        observedCasesOnly: true,
        run: null,
        cases: [],
        files: [
          { id: entry.id, file: 'contract.case.mjs', project: 'project' },
        ],
      })
      api.onEvent({ ...envelope, type: 'run-start' })
      const attempt = { id: 'native-attempt', retry: 0, repeat: 0 }
      api.onEvent({
        ...envelope,
        type: 'case-start',
        entryId: entry.id,
        caseId: 'native-case',
        name: 'suite original body',
        testName: 'original body',
        ancestors: [{ id: 'native-suite', name: 'suite' }],
        attempt,
      })
      attempt.retry = 42
      expect(JSON.parse((await read()).text)).toMatchObject({
        run: { id: envelope.runId, status: 'running' },
        cases: [
          {
            entryId: entry.id,
            caseId: 'native-case',
            name: 'suite original body',
            testName: 'original body',
            ancestors: ['suite'],
            status: 'running',
            attempt: { retry: 0 },
          },
        ],
      })
      expect((await read({ method: 'HEAD' })).text).toBe('')
      expect((await read({ method: 'POST' })).code).toBe(405)
      expect(
        (await read({ headers: { origin: 'https://foreign.invalid' } })).code
      ).toBe(403)
      expect((await read({ headers: { host: 'foreign.invalid' } })).code).toBe(
        403
      )
      expect((await read({ path: '/v1/run' })).code).toBe(404)
      expect(() =>
        api.onEvent({
          ...envelope,
          runId: 'foreign',
          type: 'run-end',
          status: 'passed',
          durationMs: 0,
        })
      ).toThrow('foreign run')
      expect(() =>
        api.onEvent({
          ...envelope,
          type: 'case-start',
          entryId: 'foreign-file',
          caseId: 'foreign-case',
          name: 'foreign',
          attempt,
        })
      ).toThrow('unselected file')
      api.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'passed',
        durationMs: 1,
      })
      expect(JSON.parse((await read()).text).run.status).toBe('passed')
    } finally {
      await api.dispose()
    }
    await expect(api.dispose()).resolves.toBeUndefined()
    await expect(read()).rejects.toThrow()
    expect(() =>
      api.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'passed',
        durationMs: 0,
      })
    ).toThrow('closed')
    await expect(
      openTestDiscoveryApi(
        '/selected',
        [{ ...entry, file: '/foreign/file' }],
        0
      )
    ).rejects.toThrow('outside')
    await expect(
      openTestDiscoveryApi('/selected', [entry, entry], 0)
    ).rejects.toThrow('unique')
  })
})
