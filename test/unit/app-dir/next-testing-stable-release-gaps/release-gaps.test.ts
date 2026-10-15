import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { retry, findPort } from 'next-test-utils'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import contracts from './contracts.json'
import { orderParallelWatchFiles } from './parallel-watch-report'

// Intentionally red stable-release gates. Keep these behavioral tests runnable:
// they must not be skipped or changed to expect the experiment's limitations.
const exec = promisify(execFile)
const nextBin = require.resolve('next/dist/bin/next')
const version = '5.0.4'
const integrity =
  'sha512-z0WxZRV2Sg48wF0FSgMq3TFG8JS38/Qr96vZVZdX6+Em9raQTvnXQvdTFJe2m3rfyJnEHeHQ/snceIdi8D1pVg=='
const consumerDependencyVersions = {
  jsdom: '30.1.2',
  'happy-dom': '21.0.1',
  '@testing-library/react': '16.3.3',
  '@testing-library/jest-dom': '7.0.1',
  react: '19.2.0',
  'react-dom': '19.2.0',
} as const
const evidenceDirectory = process.env.NEXT_TESTING_RELEASE_GAP_EVIDENCE
let directory: string
let referenceRoot: string
let referenceBin: string

type Contract = (typeof contracts)[number]
type Runner = 'vitest' | 'next'
interface Report {
  success: boolean
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  numTodoTests: number
  testResults: {
    name?: string
    assertionResults: {
      ancestorTitles: string[]
      title: string
      status: string
    }[]
  }[]
  next?: { events: { type: string; text?: string }[] }
}

async function output(
  command: string,
  args: string[],
  cwd: string,
  ci = false,
  nodeEnv: 'development' | 'production' = 'development',
  environmentVariables: Record<string, string> = {}
) {
  return exec(command, args, {
    cwd,
    env: {
      ...process.env,
      ...environmentVariables,
      NODE_ENV: nodeEnv,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      CI: ci ? '1' : undefined,
    },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  }).then(
    (value) => ({ ...value, code: 0 }),
    (error) => ({
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
      code: error.code as number | string,
    })
  )
}

function observable(report: Report | null) {
  if (!report) return null
  return {
    success: report.success,
    total: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests,
    todo: report.numTodoTests,
    cases: report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => ({
        name: [...test.ancestorTitles, test.title],
        status: test.status,
      }))
    ),
  }
}

function consumerDependencies(contract: Contract) {
  const names: (keyof typeof consumerDependencyVersions)[] = []
  if (
    contract.nextProject?.environment === 'jsdom' ||
    contract.id === 'per-file-environment'
  )
    names.push('jsdom')
  if (contract.nextProject?.environment === 'happy-dom') names.push('happy-dom')
  if (contract.id === 'testing-library-react')
    names.push(
      '@testing-library/react',
      '@testing-library/jest-dom',
      'react',
      'react-dom'
    )
  return names
}

async function prepareConsumerModules(
  contract: Contract,
  runner: Runner,
  root: string
) {
  const names = consumerDependencies(contract)
  const rootModules = join(__dirname, '../../../../node_modules')
  const referenceModules = join(referenceRoot, 'node_modules')
  const modules = join(root, 'node_modules')
  if (runner === 'vitest' || !names.length) {
    await symlink(runner === 'vitest' ? referenceModules : rootModules, modules)
  } else {
    // Keep Next and its facade from the workspace. Only the real consumer DOM
    // dependencies come from the same pinned install as the pristine runner.
    await mkdir(modules)
    const overrides = new Set<string>(names)
    const scopes = new Set(
      names
        .filter((name) => name.startsWith('@'))
        .map((name) => name.split('/')[0])
    )
    for (const name of await readdir(rootModules)) {
      if (overrides.has(name)) continue
      if (scopes.has(name)) {
        await mkdir(join(modules, name))
        for (const child of await readdir(join(rootModules, name))) {
          if (!overrides.has(`${name}/${child}`))
            await symlink(
              join(rootModules, name, child),
              join(modules, name, child)
            )
        }
      } else {
        await symlink(join(rootModules, name), join(modules, name))
      }
    }
    for (const name of names) {
      await mkdir(dirname(join(modules, name)), { recursive: true })
      await symlink(join(referenceModules, name), join(modules, name))
    }
  }
  if (!names.length) return
  const fixtureRequire = createRequire(join(root, 'package.json'))
  const referenceRequire = createRequire(join(referenceRoot, 'package.json'))
  const dependencies = await Promise.all(
    names.map(async (name) => {
      const entry = await realpath(fixtureRequire.resolve(name))
      const manifestPath = await realpath(
        fixtureRequire.resolve(`${name}/package.json`)
      )
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (
        manifest.version !== consumerDependencyVersions[name] ||
        entry !== (await realpath(referenceRequire.resolve(name))) ||
        manifestPath !==
          (await realpath(referenceRequire.resolve(`${name}/package.json`)))
      )
        throw new Error(
          `Release consumer dependency ${name} must use the pristine pinned artifact`
        )
      return { name, version: manifest.version, entry, manifestPath }
    })
  )
  if (evidenceDirectory)
    await writeFile(
      join(
        evidenceDirectory,
        `${contract.id}.${runner}.consumer-dependencies.json`
      ),
      JSON.stringify(dependencies, null, 2)
    )
}

async function prepare(
  contract: Contract,
  runner: Runner,
  label = contract.id
) {
  const root = join(directory, label, runner)
  await mkdir(root, { recursive: true })
  await cp(join(__dirname, 'fixtures', contract.id), root, { recursive: true })
  await prepareConsumerModules(contract, runner, root)
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      ...(contract.packageImports ? { imports: contract.packageImports } : {}),
    })
  )
  // Git-change fixtures create a nested repository, while their Next install is
  // the workspace node_modules symlink above. Keep both inside the explicit
  // compiler root; inferring the nested Git root would exclude that install.
  const applicationConfig = {
    ...(contract.nextApplicationConfig || {}),
    ...(runner === 'next' && contract.gitChange
      ? { turbopack: { root: await realpath(join(__dirname, '../../../..')) } }
      : {}),
  }
  await writeFile(
    join(root, 'next.config.mjs'),
    `export default ${JSON.stringify(applicationConfig)}\n`
  )
  const config = contract.nextConfig || {
    projects: [
      {
        name: 'release',
        include: ['*.case.mjs'],
        ...(contract.nextProject || {}),
        // Translate the same explicit Browser Mode request as the reference.
        ...(runner === 'next' && contract.browser
          ? { browser: { enabled: true } }
          : {}),
      },
    ],
  }
  if (contract.fixtureConfigFile) {
    // An unchanged real executable configuration is loaded by both runners.
  } else if (runner === 'next' && contract.nextConfigFile) {
    const source = contract.nextConfigFile.startsWith('vitest')
      ? `import {defineConfig} from 'vitest/config'; export default defineConfig(${JSON.stringify({ test: { include: ['*.case.mjs'], ...contract.vitest }, ...(contract.vitestAlias ? { resolve: { alias: { '@release-subject': join(root, 'subject.mjs') } } } : {}) })})\n`
      : `export default ${JSON.stringify(config)}\n`
    await writeFile(join(root, contract.nextConfigFile), source)
  } else {
    await writeFile(join(root, 'next.test.config.json'), JSON.stringify(config))
  }
  if (contract.gitChange) {
    await writeFile(
      join(root, '.gitignore'),
      'node_modules/\n.next*/\nresult.json\n'
    )
    for (const args of [
      ['init', '-b', 'main'],
      ['add', '.'],
      [
        '-c',
        'user.name=Release Fixture',
        '-c',
        'user.email=release-fixture@example.invalid',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'release fixture baseline',
      ],
    ]) {
      const result = await output(
        'git',
        ['-c', 'core.hooksPath=/dev/null', ...args],
        root
      )
      if (result.code !== 0) throw new Error(result.stderr)
    }
    await writeFile(
      join(root, contract.gitChange),
      (await readFile(join(root, contract.gitChange), 'utf8')) +
        '// changed dependency\n'
    )
  }
  if (contract.browser) {
    await mkdir(join(root, 'app'))
    await writeFile(
      join(root, 'app/layout.jsx'),
      "import React from 'react';export default function Layout({children}){return <html><body>{children}</body></html>}\n"
    )
    await writeFile(
      join(root, 'app/page.jsx'),
      "import React from 'react';export default function Page(){return <p>release fixture</p>}\n"
    )
  }
  return root
}

async function invoke(contract: Contract, runner: Runner, root: string) {
  const options: Record<string, unknown> = {
    include: ['*.case.mjs'],
    ...contract.vitest,
  }
  if (contract.coverage) {
    options.coverage = {
      enabled: true,
      provider: 'v8',
      include: ['subject.mjs', 'unimported.mjs'],
      exclude: ['excluded.mjs'],
      reporter: ['json', 'lcov'],
      ...(contract.threshold ? { thresholds: { branches: 100 } } : {}),
      ...(contract.coverageOptions || {}),
    }
  }
  if (contract.browser) {
    options.browser = {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }],
    }
  }
  const configPath = contract.fixtureConfigFile
    ? join(root, contract.fixtureConfigFile)
    : join(referenceRoot, `${contract.id}.config.mjs`)
  if (!contract.fixtureConfigFile)
    await writeFile(
      configPath,
      (contract.browser
        ? "import {playwright} from '@vitest/browser-playwright';\n"
        : '') +
        `const config=${JSON.stringify({ test: options })};\n` +
        (contract.vitestAlias
          ? `config.resolve={alias:{'@release-subject':${JSON.stringify(join(root, 'subject.mjs'))}}};\n`
          : '') +
        (contract.browser
          ? 'config.test.browser.provider=playwright();\n'
          : '') +
        'export default config;\n'
    )
  const args =
    runner === 'vitest'
      ? [
          referenceBin,
          contract.command === 'related' ? 'related' : 'run',
          '--root',
          root,
          '--config',
          configPath,
          '--reporter=json',
          '--reporter=default',
          '--outputFile=result.json',
        ]
      : [
          nextBin,
          'test',
          root,
          '--run',
          '--reporter',
          'json',
          '--outputFile',
          'result.json',
        ]
  if (contract.command === 'related' && runner === 'next')
    args.push('--related')
  args.push(...(contract.args || []))
  if (contract.customReporter)
    args.push('--reporter', join(root, 'reporter.mjs'))
  if (contract.coverage && runner === 'next') {
    args.push(
      '--coverage',
      '--coverage.reporter=json',
      '--coverage.reporter=lcov',
      '--coverage.include=subject.mjs',
      '--coverage.include=unimported.mjs',
      '--coverage.exclude=excluded.mjs'
    )
    if (contract.threshold) args.push('--coverage.thresholds.branches=100')
    if (contract.coverageOptions?.reportOnFailure)
      args.push('--coverage.reportOnFailure')
  }
  const result = await output(
    process.execPath,
    args,
    root,
    contract.ci,
    contract.mode === 'production' ? 'production' : 'development',
    contract.environmentVariables || {}
  )
  let report: Report | null = null
  try {
    report = JSON.parse(await readFile(join(root, 'result.json'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return {
    ...result,
    report,
    outcomes: observable(report),
    providerTrace: contract.customCoverage
      ? await readFile(join(root, 'provider-trace.jsonl'), 'utf8')
          .then((text) =>
            text
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
          )
          .catch((error) => {
            if (error.code === 'ENOENT') return null
            throw error
          })
      : undefined,
  }
}

beforeAll(async () => {
  directory = await mkdtemp(
    join(__dirname, '../../../../.next-test-release-gaps-')
  )
  referenceRoot = join(directory, 'pristine-reference')
  await mkdir(referenceRoot)
  await writeFile(
    join(referenceRoot, 'package.json'),
    JSON.stringify({
      private: true,
      dependencies: {
        vitest: version,
        vite: '8.3.4',
        '@vitest/coverage-v8': version,
        '@vitest/browser-playwright': version,
        ...consumerDependencyVersions,
        'vitest-browser-react': '2.3.0',
        pathe: '2.0.3',
        playwright: '1.64.0',
        '@edge-runtime/vm': '5.0.0',
        typescript: '6.0.2',
      },
    })
  )
  const excluded = [
    'vitest',
    '@vitest/expect',
    '@vitest/snapshot',
    '@vitest/spy',
    '@vitest/utils',
    '@vitest/mocker',
    '@vitest/pretty-format',
    '@vitest/runner',
    '@vitest/coverage-v8',
    '@vitest/browser-playwright',
  ]
  await writeFile(
    join(referenceRoot, 'pnpm-workspace.yaml'),
    'packages: []\nminimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n' +
      excluded.map((name) => `  - '${name}@${version}'\n`).join('')
  )
  await exec('pnpm', ['install', '--ignore-scripts'], {
    cwd: referenceRoot,
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const lock = await readFile(join(referenceRoot, 'pnpm-lock.yaml'), 'utf8')
  const installed = JSON.parse(
    await readFile(
      join(referenceRoot, 'node_modules/vitest/package.json'),
      'utf8'
    )
  )
  if (
    installed.version !== version ||
    !lock.includes(
      `vitest@${version}:\n    resolution: {integrity: ${integrity}}`
    ) ||
    lock.includes('patchedDependencies:')
  )
    throw new Error(
      'Release conformance requires the pristine pinned Vitest 5.0.4 artifact'
    )
  referenceBin = join(referenceRoot, 'node_modules/vitest/vitest.mjs')
  if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true })
}, 180000)

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

it.each(contracts)(
  '$surface: $id',
  async (contract) => {
    const roots = {
      vitest: await prepare(contract, 'vitest'),
      next: await prepare(contract, 'next'),
    }
    const reference = await invoke(contract, 'vitest', roots.vitest)
    const actual = await invoke(contract, 'next', roots.next)
    const evidence = {
      id: contract.id,
      surface: contract.surface,
      reference,
      next: actual,
    }
    if (evidenceDirectory)
      await writeFile(
        join(evidenceDirectory, `${contract.id}.json`),
        JSON.stringify(evidence, null, 2)
      )
    if (reference.code !== (contract.expectedCode || 0) || !reference.report) {
      throw new Error(
        `REFERENCE FIXTURE INVALID (${contract.id}): ${reference.code}\n${reference.stdout}\n${reference.stderr}`
      )
    }
    for (const text of contract.diagnosticIncludes || [])
      expect(reference.stdout + reference.stderr).toContain(text)
    for (const [file, expected] of Object.entries(contract.expectedFiles || {}))
      expect(await readFile(join(roots.vitest, file), 'utf8')).toBe(expected)
    if (contract.customCoverage) {
      const trace = reference.providerTrace
      if (
        !trace ||
        ![
          'initialize',
          'clean',
          'start',
          'take',
          'suite',
          'generate',
          'report',
          'stop',
        ].every((name) => trace.some((event) => event.name === name)) ||
        !trace.some(
          (event) =>
            event.name === 'suite' && event.coverage?.releasePayload === 42
        )
      )
        throw new Error(
          `REFERENCE PROVIDER FIXTURE INVALID\n${JSON.stringify(trace)}`
        )
    }
    if (contract.vitestAlias && actual.code !== 0) {
      expect(actual.stdout + actual.stderr).toContain('resolve.alias')
      expect(actual.stdout + actual.stderr).toContain('@release-subject')
      return
    }
    if (actual.code !== reference.code || !actual.report) {
      throw new Error(
        `NEXT RELEASE GAP (${contract.id}): expected exit ${reference.code}, received ${actual.code}\n${actual.stdout}\n${actual.stderr}\n${JSON.stringify(actual.outcomes)}`
      )
    }
    const normalizedOutcomes = (result: typeof actual.outcomes) =>
      result && contract.unorderedCases
        ? {
            ...result,
            cases: [...result.cases].sort((a, b) =>
              JSON.stringify(a.name).localeCompare(JSON.stringify(b.name))
            ),
          }
        : result
    expect(normalizedOutcomes(actual.outcomes)).toEqual(
      normalizedOutcomes(reference.outcomes)
    )
    for (const text of contract.diagnosticIncludes || [])
      expect(
        actual.stdout + actual.stderr + JSON.stringify(actual.report)
      ).toContain(text)
    if (contract.compareFailureMessages) {
      const failures = (report: Report) =>
        report.testResults.flatMap((file) =>
          file.assertionResults.map((result) =>
            (
              result as typeof result & { failureMessages: string[] }
            ).failureMessages.map((message) => message.split('\n')[0])
          )
        )
      expect(failures(actual.report)).toEqual(failures(reference.report))
    }
    const trace = (text: string) => text.match(/RELEASE_TRACE=(\[[^\n]*\])/g)
    const nextText =
      actual.report.next?.events
        .filter((event) => event.type === 'output')
        .map((event) => event.text)
        .join('') || actual.stdout + actual.stderr
    expect(trace(nextText)).toEqual(trace(reference.stdout + reference.stderr))
    for (const file of contract.compareFiles || [])
      expect(await readFile(join(roots.next, file), 'utf8')).toBe(
        await readFile(join(roots.vitest, file), 'utf8')
      )
    if (contract.customReporter && !contract.expectedCode)
      expect(
        JSON.parse(
          await readFile(join(roots.next, 'custom-result.json'), 'utf8')
        )
      ).toEqual(
        JSON.parse(
          await readFile(join(roots.vitest, 'custom-result.json'), 'utf8')
        )
      )
    if (contract.customCoverage) {
      expect(
        JSON.parse(
          await readFile(join(roots.next, 'custom-coverage.json'), 'utf8')
        )
      ).toEqual(
        JSON.parse(
          await readFile(join(roots.vitest, 'custom-coverage.json'), 'utf8')
        )
      )
    }
    if (contract.compareJsonMetadata) {
      const metadata = (report: Report) =>
        report.testResults.flatMap((file) =>
          file.assertionResults.map((result) => ({
            fields: Object.keys(result).sort(),
            ...Object.fromEntries(
              Object.entries(result).filter(
                ([name]) =>
                  ![
                    'startTime',
                    'duration',
                    'failureMessages',
                    'fullName',
                  ].includes(name)
              )
            ),
          }))
        )
      expect(metadata(actual.report)).toEqual(metadata(reference.report))
    }
    if (contract.coverage) {
      const referenceCoverage = JSON.parse(
        await readFile(
          join(roots.vitest, 'coverage/coverage-final.json'),
          'utf8'
        )
      )
      const actualCoverage = JSON.parse(
        await readFile(join(roots.next, 'coverage/coverage-final.json'), 'utf8')
      )
      const original = async (
        coverage: typeof referenceCoverage,
        root: string
      ) => {
        const owner = await realpath(root)
        return Object.fromEntries(
          await Promise.all(
            Object.entries(coverage).map(async ([file, data]) => {
              expect(isAbsolute(file)).toBe(true)
              expect(data).toHaveProperty('path', file)
              const canonical = await realpath(file)
              expect(canonical).toBe(file)
              const path = relative(owner, canonical)
              expect(path).not.toBe('')
              expect(path).not.toBe('..')
              expect(path.startsWith(`..${sep}`)).toBe(false)
              expect(isAbsolute(path)).toBe(false)
              const hash = (bytes: Buffer) =>
                createHash('sha256').update(bytes).digest('hex')
              expect(hash(await readFile(canonical))).toBe(
                hash(
                  await readFile(join(__dirname, 'fixtures', contract.id, path))
                )
              )
              const portable = path.split(sep).join('/')
              return [portable, { ...(data as object), path: portable }]
            })
          )
        )
      }
      expect(await original(actualCoverage, roots.next)).toEqual(
        await original(referenceCoverage, roots.vitest)
      )
      expect(
        await readFile(join(roots.next, 'coverage/lcov.info'), 'utf8')
      ).toContain('BRDA:')
    }
  },
  120000
)

it.each(['fixture-overloads', 'context-public-types', 'matcher-augmentation'])(
  '1 types: %s',
  async (id) => {
    const results = {} as Record<Runner, Awaited<ReturnType<typeof output>>>
    const source = await readFile(join(__dirname, 'types', `${id}.txt`), 'utf8')
    for (const runner of ['vitest', 'next'] as const) {
      const root = join(directory, id, runner)
      await mkdir(root, { recursive: true })
      await symlink(
        runner === 'vitest'
          ? join(referenceRoot, 'node_modules')
          : join(__dirname, '../../../../node_modules'),
        join(root, 'node_modules')
      )
      await writeFile(join(root, 'contract.ts'), source)
      await writeFile(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            module: 'ESNext',
            target: 'ESNext',
            moduleResolution: 'bundler',
            types: [],
            ...(runner === 'next'
              ? {
                  paths: {
                    vitest: [
                      // TypeScript 6 treats an explicit .js paths target as JavaScript,
                      // bypassing its adjacent declarations. Resolve the shipped
                      // public declaration wrapper without an extension instead.
                      require
                        .resolve('next/experimental/testing/vitest')
                        .replace(/\.js$/, ''),
                    ],
                  },
                }
              : {}),
          },
          include: ['contract.ts'],
        })
      )
      results[runner] = await output(
        process.execPath,
        [
          require.resolve('typescript/lib/tsc'),
          '--project',
          join(root, 'tsconfig.json'),
        ],
        root
      )
    }
    if (evidenceDirectory)
      await writeFile(
        join(evidenceDirectory, `${id}.json`),
        JSON.stringify({ id, surface: '1 types', ...results }, null, 2)
      )
    if (results.vitest.code !== 0)
      throw new Error(
        `REFERENCE TYPE FIXTURE INVALID (${id})\n${results.vitest.stdout}`
      )
    if (results.next.code !== 0)
      throw new Error(`NEXT TYPE RELEASE GAP (${id})\n${results.next.stdout}`)
  },
  120000
)

it('8 CLI: lists collected case names through the public command', async () => {
  const contract = contracts.find(
    (item) => item.id === 'workspace-helper-state'
  )!
  const expectedRoot = await prepare(contract, 'vitest', 'listed-cases')
  const actualRoot = await prepare(contract, 'next', 'listed-cases')
  const configPath = join(referenceRoot, 'listed.config.mjs')
  await writeFile(configPath, "export default {test:{include:['*.case.mjs']}}")
  const reference = await output(
    process.execPath,
    [
      referenceBin,
      'list',
      '--root',
      expectedRoot,
      '--config',
      configPath,
      '--json',
    ],
    expectedRoot
  )
  const actual = await output(
    process.execPath,
    [nextBin, 'test', actualRoot, '--list', '--json'],
    actualRoot
  )
  if (evidenceDirectory)
    await writeFile(
      join(evidenceDirectory, 'collected-case-list.json'),
      JSON.stringify({ reference, next: actual }, null, 2)
    )
  expect(reference.code).toBe(0)
  expect(reference.stdout).toContain('helper shares active assertion count')
  expect(actual.code).toBe(0)
  expect(actual.stdout).toContain('helper shares active assertion count')
}, 120000)

async function watchProbe(
  runner: Runner,
  id: string,
  change:
    | 'source'
    | 'setup'
    | 'addition'
    | 'deletion'
    | 'rapid'
    | 'config'
    | 'snapshot',
  environment: 'node' | 'browser' = 'node',
  parallel = false
) {
  const root = join(directory, id, runner)
  await mkdir(root, { recursive: true })
  await symlink(
    runner === 'vitest'
      ? join(referenceRoot, 'node_modules')
      : join(__dirname, '../../../../node_modules'),
    join(root, 'node_modules')
  )
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  )
  await writeFile(join(root, 'next.config.mjs'), 'export default {}\n')
  await writeFile(
    join(root, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: parallel ? 2 : 1,
      projects: [
        {
          name: 'release',
          environment,
          include: ['*.case.mjs'],
          setupFiles: ['./setup.mjs'],
        },
      ],
    })
  )
  await writeFile(join(root, 'setup.mjs'), 'globalThis.releaseSetup=1\n')
  await writeFile(join(root, 'subject.mjs'), 'export const value=1\n')
  const text =
    "import {test,expect} from 'vitest';import {value} from './subject.mjs';test('tracked',()=>expect(value+globalThis.releaseSetup).toBe(2))\n"
  const parallelSources = parallel ? new Map<string, string>() : undefined
  const writeCase = async (file: string, source: string) => {
    await writeFile(join(root, file), source)
    parallelSources?.set(
      file,
      createHash('sha256').update(source).digest('hex')
    )
  }
  await writeCase('contract.case.mjs', text)
  if (environment === 'browser') {
    await mkdir(join(root, 'app'))
    await writeFile(
      join(root, 'app/layout.jsx'),
      "import React from 'react';export default function Layout({children}){return <html><body>{children}</body></html>}\n"
    )
    await writeFile(
      join(root, 'app/page.jsx'),
      "import React from 'react';export default function Page(){return <p>browser watch</p>}\n"
    )
  }
  if (parallel)
    await writeCase('second.case.mjs', text.replace("'tracked'", "'second'"))
  const config = join(referenceRoot, `${id}.config.mjs`)
  await writeFile(
    config,
    (environment === 'browser'
      ? "import {playwright} from '@vitest/browser-playwright';\n"
      : '') +
      `export default {test:{include:['*.case.mjs'],setupFiles:['./setup.mjs'],maxWorkers:${parallel ? 2 : 1}${environment === 'browser' ? ",browser:{enabled:true,headless:true,provider:playwright(),instances:[{browser:'chromium'}]}" : ''}}}\n`
  )

  const args =
    runner === 'vitest'
      ? [
          referenceBin,
          '--watch',
          '--root',
          root,
          '--config',
          config,
          '--reporter=json',
          '--outputFile=result.json',
        ]
      : [
          nextBin,
          'test',
          root,
          '--watch',
          '--reporter',
          'json',
          '--outputFile',
          'result.json',
        ]
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      CI: undefined,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    },
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = '',
    stderr = ''
  child.stdout.on('data', (data) => (stdout += data))
  child.stderr.on('data', (data) => (stderr += data))
  const ended = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  )
  let result: unknown
  try {
    await retry(
      async () => {
        if (child.exitCode !== null)
          throw new Error(`watch exited ${child.exitCode}: ${stdout}${stderr}`)
        const first: Report = JSON.parse(
          await readFile(join(root, 'result.json'), 'utf8')
        )
        if (parallelSources)
          await orderParallelWatchFiles(first, root, parallelSources)
        expect(first.numPassedTests).toBe(parallel ? 2 : 1)
      },
      10000,
      100,
      'initial watch result'
    )
    const first = await readFile(join(root, 'result.json'), 'utf8')
    if (change === 'source' || change === 'rapid') {
      await writeFile(join(root, 'subject.mjs'), 'export const value=2\n')
      if (change === 'rapid')
        await writeFile(join(root, 'subject.mjs'), 'export const value=3\n')
    } else if (change === 'setup')
      await writeFile(join(root, 'setup.mjs'), 'globalThis.releaseSetup=2\n')
    else if (change === 'addition' || change === 'deletion') {
      await writeCase(
        'added.case.mjs',
        "import {test} from 'vitest';test('added',()=>{})\n"
      )
      if (change === 'deletion') {
        await retry(
          async () =>
            expect(
              JSON.parse(await readFile(join(root, 'result.json'), 'utf8'))
                .testResults.flatMap((file) => file.assertionResults)
                .some((test) => test.title === 'added')
            ).toBe(true),
          10000,
          100,
          'added file'
        )
        await rm(join(root, 'added.case.mjs'))
        parallelSources?.delete('added.case.mjs')
        await writeCase(
          'contract.case.mjs',
          text.replace("'tracked'", "'tracked after deletion'")
        )
      }
    } else if (change === 'config') {
      await writeFile(
        runner === 'vitest' ? config : join(root, 'next.test.config.json'),
        runner === 'vitest'
          ? "export default {test:{include:['*.case.mjs'],setupFiles:['./setup.mjs'],testNamePattern:'excluded'}}\n"
          : JSON.stringify({
              projects: [
                {
                  name: 'release',
                  include: ['*.case.mjs'],
                  setupFiles: ['./setup.mjs'],
                },
              ],
              testNamePattern: 'excluded',
            })
      )
    } else {
      await writeCase(
        'contract.case.mjs',
        "import {test,expect} from 'vitest';test('tracked',()=>expect('new').toMatchSnapshot())\n"
      )
    }
    await retry(
      async () => {
        const bytes = await readFile(join(root, 'result.json'), 'utf8')
        expect(bytes).not.toBe(first)
        const report: Report = JSON.parse(bytes)
        if (change === 'source' || change === 'setup' || change === 'rapid')
          expect(report.numFailedTests).toBe(parallel ? 2 : 1)
        if (change === 'addition')
          expect(
            report.testResults
              .flatMap((file) => file.assertionResults)
              .map((test) => test.title)
          ).toContain('added')
        if (change === 'deletion') {
          expect(report.numTotalTests).toBe(1)
          expect(
            report.testResults
              .flatMap((file) => file.assertionResults)
              .map((test) => test.title)
          ).toEqual(['tracked after deletion'])
        }
        if (change === 'config') expect(report.numPendingTests).toBe(1)
        if (change === 'snapshot') expect(report.numPassedTests).toBe(1)
        result = observable(
          parallelSources
            ? await orderParallelWatchFiles(report, root, parallelSources)
            : report
        )
      },
      10000,
      100,
      'changed watch result'
    )
  } finally {
    if (child.exitCode === null) {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else {
        try {
          process.kill(-child.pid!, 'SIGTERM')
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
      }
    }
    await ended
    if (evidenceDirectory)
      await writeFile(
        join(evidenceDirectory, `${id}-${runner}.json`),
        JSON.stringify(
          {
            id,
            runner,
            stdout,
            stderr,
            result,
            report: await readFile(join(root, 'result.json'), 'utf8').catch(
              () => null
            ),
          },
          null,
          2
        )
      )
  }
  return result
}

it.each([
  'source',
  'setup',
  'addition',
  'deletion',
  'rapid',
  'config',
  'snapshot',
] as const)(
  '8 watch: %s changes preserve fresh results and cleanup',
  async (change) => {
    const id = `watch-${change}`
    const expected = await watchProbe('vitest', id, change)
    const actual = await watchProbe('next', id, change)
    expect(actual).toEqual(expected)
  },
  60000
)

it('10 reports: consumes a real Vitest blob through the public merge command', async () => {
  const contract = contracts.find(
    (item) => item.id === 'workspace-helper-state'
  )!
  const root = await prepare(contract, 'vitest', 'vitest-blob')
  const config = join(referenceRoot, 'blob.config.mjs')
  await writeFile(config, "export default {test:{include:['*.case.mjs']}}\n")
  const blobDirectory = join(root, 'blobs')
  await mkdir(blobDirectory)
  const reference = await output(
    process.execPath,
    [
      referenceBin,
      'run',
      '--root',
      root,
      '--config',
      config,
      '--reporter=blob',
      `--outputFile=${join(blobDirectory, 'reference.blob')}`,
    ],
    root
  )
  const actual = await output(
    process.execPath,
    [
      nextBin,
      'test',
      root,
      '--merge-reports',
      blobDirectory,
      '--reporter',
      'json',
      '--outputFile',
      'merged.json',
    ],
    root
  )
  if (evidenceDirectory)
    await writeFile(
      join(evidenceDirectory, 'vitest-blob.json'),
      JSON.stringify({ reference, next: actual }, null, 2)
    )
  expect(reference.code).toBe(0)
  expect(actual.code).toBe(0)
  expect(
    JSON.parse(await readFile(join(root, 'merged.json'), 'utf8')).numPassedTests
  ).toBe(1)
}, 120000)

it.each([false, true])(
  '5/12 publication: restart recovers a coherent snapshot revision after parent crash (user edit: %s)',
  async (userEdit) => {
    const contract = contracts.find(
      (item) => item.id === 'workspace-helper-state'
    )!
    const root = await prepare(
      contract,
      'next',
      `snapshot-parent-crash-${userEdit}`
    )
    const original =
      "import {test,expect} from 'vitest';test('coordinated',()=>{expect('new external').toMatchSnapshot();expect('new inline').toMatchInlineSnapshot(`\"old inline\"`)})\n"
    await writeFile(join(root, 'contract.case.mjs'), original)
    await mkdir(join(root, '__snapshots__'))
    const oldSnapshot =
      '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`coordinated 1`] = `"old external"`;\n'
    const snapshot = join(root, '__snapshots__/contract.case.mjs.snap')
    await writeFile(snapshot, oldSnapshot)
    const result = await exec(
      process.execPath,
      [nextBin, 'test', root, '--run', '--update'],
      {
        cwd: root,
        timeout: 60000,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
          NEXT_TESTING_RELEASE_FAULT_ROOT: root,
          NODE_OPTIONS: `--require=${join(__dirname, 'snapshot-crash-preload.cjs')}`,
        },
      }
    ).then(
      (value) => ({ ...value, code: 0 }),
      (error) => ({
        stdout: String(error.stdout || ''),
        stderr: String(error.stderr || ''),
        code: error.code,
        signal: error.signal,
      })
    )
    const fault = JSON.parse(
      await readFile(join(root, 'fault-observed.json'), 'utf8')
    )
    const immediate = {
      source: await readFile(join(root, 'contract.case.mjs'), 'utf8'),
      snapshot: await readFile(snapshot, 'utf8'),
    }
    const edited = immediate.source + '// user edit after crash\n'
    if (userEdit) await writeFile(join(root, 'contract.case.mjs'), edited)
    // CI disables new-only writes; this restart must perform recovery without
    // treating another update request as authorization to repair a mixed revision.
    const restart = await output(
      process.execPath,
      [nextBin, 'test', root, '--run'],
      root,
      true
    )
    const after = {
      source: await readFile(join(root, 'contract.case.mjs'), 'utf8'),
      snapshot: await readFile(snapshot, 'utf8'),
    }
    if (evidenceDirectory)
      await writeFile(
        join(evidenceDirectory, `snapshot-parent-crash-${userEdit}.json`),
        JSON.stringify(
          {
            result,
            fault,
            before: { source: original, snapshot: oldSnapshot },
            immediate,
            userEdit,
            restart,
            after,
          },
          null,
          2
        )
      )
    expect(result.code).not.toBe(0)
    // A future durable journal can satisfy this at the restart boundary.
    // Do not demand an impossible simultaneous rename of separate files.
    if (userEdit) expect(after.source).toBe(edited)
    expect(after.source.includes('"old inline"')).toBe(
      after.snapshot.includes('"old external"')
    )
  },
  120000
)

async function applicationReference(
  root: string,
  mode: 'development' | 'production',
  verify: (url: string) => Promise<void>
) {
  // Ordinary apps use stable React, as clean published consumers do. The
  // repository's root React canary is reserved for framework development.
  await rm(join(root, 'node_modules'))
  await mkdir(join(root, 'node_modules'))
  for (const name of ['react', 'react-dom'])
    await symlink(
      join(referenceRoot, 'node_modules', name),
      join(root, 'node_modules', name)
    )
  await symlink(
    join(__dirname, '../../../../packages/next'),
    join(root, 'node_modules/next')
  )
  if (mode === 'production') {
    const built = await output(
      process.execPath,
      [nextBin, 'build'],
      root,
      false,
      'production'
    )
    if (built.code !== 0)
      throw new Error(
        `NORMAL NEXT APPLICATION BUILD INVALID\n${built.stdout}${built.stderr}`
      )
  }
  const port = await findPort()
  const child = spawn(
    process.execPath,
    [nextBin, mode === 'development' ? 'dev' : 'start', '--port', String(port)],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: mode, NEXT_TELEMETRY_DISABLED: '1' },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  let stdout = '',
    stderr = ''
  child.stdout.on('data', (data) => (stdout += data))
  child.stderr.on('data', (data) => (stderr += data))
  const ended = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  )
  try {
    await verify(`http://localhost:${port}`)
  } finally {
    if (child.exitCode === null) {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else {
        try {
          process.kill(-child.pid!, 'SIGTERM')
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
      }
    }
    await ended
    if (evidenceDirectory)
      await writeFile(
        join(evidenceDirectory, `normal-app-${mode}.json`),
        JSON.stringify({ stdout, stderr }, null, 2)
      )
  }
}

it('11 Next fidelity: a real dynamic route and request context remain renderable in the route-aware RSC profile', async () => {
  const contract = contracts.find(
    (item) => item.id === 'workspace-helper-state'
  )!
  const root = await prepare(contract, 'next', 'route-rsc-fidelity')
  await mkdir(join(root, 'app', 'reference', '[slug]'), { recursive: true })
  await writeFile(
    join(root, 'app/layout.jsx'),
    "import React from 'react';export default function Layout({children}){return <html><body>{children}</body></html>}\n"
  )
  await writeFile(
    join(root, 'app/reference/[slug]/page.jsx'),
    "import React from 'react';import {headers} from 'next/headers';export default async function Page({params}){const {slug}=await params;return <p id='reference'>{slug}:{(await headers()).get('x-release-request')}</p>}\n"
  )
  await applicationReference(root, 'development', async (url) => {
    await retry(
      async () => {
        const response = await fetch(`${url}/reference/sample`, {
          headers: { 'x-release-request': 'normal' },
        })
        expect(response.status).toBe(200)
        const html = await response.text()
        expect(
          html
            .match(/<p id="reference">(.*?)<\/p>/)![1]
            .replace(/<!-- -->/g, '')
        ).toBe('sample:normal')
      },
      30000,
      200,
      'normal route response'
    )
  })
  await writeFile(
    join(root, 'next.test.config.json'),
    JSON.stringify({
      projects: [
        {
          name: 'release',
          environment: 'rsc',
          route: '/reference/[slug]',
          include: ['*.case.mjs'],
        },
      ],
    })
  )
  await writeFile(
    join(root, 'contract.case.mjs'),
    "import {test,expect} from 'vitest';import {rsc} from 'next/experimental/testing/rsc';import Page from './app/reference/[slug]/page.jsx';test('equivalent dynamic request',async()=>{const result=await rsc.render(Page,{params:Promise.resolve({slug:'sample'})},{cacheScope:'file',url:'http://localhost/reference/sample',headers:{'x-release-request':'normal'}});expect(result.text).toBe('sample:normal')})\n"
  )
  const result = await output(
    process.execPath,
    [
      nextBin,
      'test',
      root,
      '--run',
      '--reporter',
      'json',
      '--outputFile',
      'result.json',
    ],
    root
  )
  if (evidenceDirectory)
    await writeFile(
      join(evidenceDirectory, 'route-rsc-fidelity.json'),
      JSON.stringify(result, null, 2)
    )
  if (result.code !== 0)
    throw new Error(
      `NEXT ROUTE FIDELITY RELEASE GAP\n${result.stdout}${result.stderr}`
    )
  expect(
    JSON.parse(await readFile(join(root, 'result.json'), 'utf8')).numPassedTests
  ).toBe(1)
}, 120000)

it('11 production: registered client components mount and hydrate as in a normal production application', async () => {
  const contract = contracts.find(
    (item) => item.id === 'workspace-helper-state'
  )!
  const root = await prepare(contract, 'next', 'production-component-fidelity')
  await mkdir(join(root, 'app'))
  await writeFile(
    join(root, 'Counter.jsx'),
    "'use client';import React,{useState} from 'react';export default function Counter(){const [value,set]=useState(0);return <button onClick={()=>set(value+1)}>count:{value}</button>}\n"
  )
  await writeFile(
    join(root, 'app/layout.jsx'),
    "import React from 'react';export default function Layout({children}){return <html><body>{children}</body></html>}\n"
  )
  await writeFile(
    join(root, 'app/page.jsx'),
    "import React from 'react';import Counter from '../Counter';export default function Page(){return <Counter/>}\n"
  )
  await applicationReference(root, 'production', async (url) => {
    const { chromium } = require(
      join(referenceRoot, 'node_modules/playwright')
    ) as typeof import('playwright')
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await retry(
        async () => {
          await page.goto(url)
          expect(await page.locator('button').textContent()).toBe('count:0')
        },
        15000,
        200,
        'normal production mount'
      )
      await page.locator('button').click()
      expect(await page.locator('button').textContent()).toBe('count:1')
    } finally {
      await browser.close()
    }
  })
  await writeFile(
    join(root, 'next.test.config.json'),
    JSON.stringify({
      projects: [
        {
          name: 'release',
          environment: 'browser',
          mode: 'production',
          include: ['*.case.mjs'],
          browserFixtures: [{ id: 'counter', module: './Counter.jsx' }],
        },
      ],
    })
  )
  await writeFile(
    join(root, 'contract.case.mjs'),
    "import {test,expect} from 'vitest';import {browser} from 'next/experimental/testing/browser';test('production mounting',async()=>{const {component}=await browser();const root=await component.mount('counter');expect(await root.locator('button').textContent()).toBe('count:0');await root.locator('button').click();expect(await root.locator('button').textContent()).toBe('count:1')})\n"
  )
  const result = await exec(
    process.execPath,
    [nextBin, 'test', root, '--run'],
    {
      cwd: root,
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    }
  ).then(
    (value) => ({ ...value, code: 0 }),
    (error) => ({
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
      code: error.code,
    })
  )
  if (evidenceDirectory)
    await writeFile(
      join(evidenceDirectory, 'production-component-fidelity.json'),
      JSON.stringify(result, null, 2)
    )
  if (result.code !== 0)
    throw new Error(
      `NEXT PRODUCTION MOUNT RELEASE GAP\n${result.stdout}${result.stderr}`
    )
}, 180000)

it('12 reliability: repeated public runs release worker PIDs, run locks and owned compiler artifacts', async () => {
  const contract = contracts.find(
    (item) => item.id === 'workspace-helper-state'
  )!
  const root = await prepare(contract, 'next', 'repeated-resource-cleanup')
  await writeFile(
    join(root, 'contract.case.mjs'),
    "import {test,expect} from 'vitest';test('owned worker',()=>{console.log('RELEASE_PID='+process.pid);expect(42).toBe(42)})\n"
  )
  const cycles = []
  for (let index = 0; index < 12; index++) {
    await rm(join(root, 'result.json'), { force: true })
    const result = await invoke(contract, 'next', root)
    expect(result.code).toBe(0)
    const text = result
      .report!.next!.events.filter((event) => event.type === 'output')
      .map((event) => event.text)
      .join('')
    const pid = Number(text.match(/RELEASE_PID=(\d+)/)![1])
    expect(() => process.kill(pid, 0)).toThrow(
      expect.objectContaining({ code: 'ESRCH' })
    )
    const leftovers = (await readdir(root)).filter((name) =>
      name.startsWith('.next-test-')
    )
    expect(leftovers).toEqual([])
    cycles.push({ index, pid, leftovers })
  }
  if (evidenceDirectory)
    await writeFile(
      join(evidenceDirectory, 'repeated-resource-cleanup.json'),
      JSON.stringify(cycles, null, 2)
    )
}, 120000)

it('10 JUnit: existing parsers see equivalent testcase attributes and failure/skipped outcomes', async () => {
  const contract = contracts.find((item) => item.id === 'json-metadata')!
  const results = {} as Record<
    Runner,
    { result: Awaited<ReturnType<typeof output>>; xml: string }
  >
  for (const runner of ['vitest', 'next'] as const) {
    const root = await prepare(contract, runner, 'junit-schema')
    const config = join(referenceRoot, 'junit.config.mjs')
    await writeFile(config, "export default {test:{include:['*.case.mjs']}}\n")
    const args =
      runner === 'vitest'
        ? [
            referenceBin,
            'run',
            '--root',
            root,
            '--config',
            config,
            '--reporter=junit',
            '--outputFile=report.xml',
          ]
        : [
            nextBin,
            'test',
            root,
            '--run',
            '--reporter',
            'junit',
            '--outputFile',
            'report.xml',
          ]
    const result = await output(process.execPath, args, root)
    results[runner] = {
      result,
      xml: await readFile(join(root, 'report.xml'), 'utf8'),
    }
  }
  if (evidenceDirectory)
    await writeFile(
      join(evidenceDirectory, 'junit-schema.json'),
      JSON.stringify(results, null, 2)
    )
  expect(results.vitest.result.code).toBe(0)
  expect(results.next.result.code).toBe(0)
  const cases = (xml: string) =>
    [...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)]
      .map((match) => ({
        attributes: Object.fromEntries(
          [...match[1].matchAll(/(\w+)="([^"]*)"/g)]
            .filter(([_, key]) => !['time', 'file'].includes(key))
            .map(([_, key, value]) => [key, value])
        ),
        skipped: match[2]?.includes('<skipped') || false,
      }))
      .sort((a, b) =>
        String(a.attributes.name).localeCompare(String(b.attributes.name))
      )
  expect(cases(results.next.xml)).toEqual(cases(results.vitest.xml))
}, 120000)

it.each(['body', 'beforeEach', 'fixture', 'finished'] as const)(
  '12 cancellation: %s phase retains snapshots and releases its worker/lock',
  async (phase) => {
    const contract = contracts.find(
      (item) => item.id === 'workspace-helper-state'
    )!
    const root = await prepare(contract, 'next', `cancel-${phase}`)
    const imports =
      "import {test,expect,beforeEach,onTestFinished} from 'vitest';import {writeFileSync} from 'node:fs';"
    const hold =
      "async function hold(signal){writeFileSync('phase-ready.json',JSON.stringify({pid:process.pid}));if(!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));}"
    const check = "expect('new').toMatchSnapshot();"
    let declarations = ''
    if (phase === 'body')
      declarations = `test('cancelled owner',async({signal})=>{${check}await hold(signal)})`
    if (phase === 'beforeEach')
      declarations = `beforeEach(async({signal})=>{${check}await hold(signal)});test('cancelled owner',()=>{})`
    if (phase === 'fixture')
      declarations = `const owned=test.extend({lease:async({signal},use)=>{${check}await hold(signal);await use(42)}});owned('cancelled owner',({lease})=>expect(lease).toBe(42))`
    if (phase === 'finished')
      declarations = `test('cancelled owner',()=>{${check}onTestFinished(async({signal})=>hold(signal))})`
    await writeFile(
      join(root, 'contract.case.mjs'),
      imports + hold + declarations + '\n'
    )
    await mkdir(join(root, '__snapshots__'))
    const snapshot = join(root, '__snapshots__/contract.case.mjs.snap')
    const before =
      '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`cancelled owner 1`] = `"old"`;\n'
    await writeFile(snapshot, before)
    const child = spawn(
      process.execPath,
      [nextBin, 'test', root, '--run', '--update'],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    let stdout = '',
      stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const ended = new Promise((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal }))
    )
    let worker: { pid: number } | undefined
    try {
      await retry(
        async () => {
          worker = JSON.parse(
            await readFile(join(root, 'phase-ready.json'), 'utf8')
          )
        },
        10000,
        100,
        `ready in ${phase}`
      )
      child.kill('SIGINT')
      await retry(
        () => expect(child.exitCode).not.toBeNull(),
        10000,
        100,
        `cancel ${phase}`
      )
      expect(child.exitCode).not.toBe(0)
      expect(await readFile(snapshot, 'utf8')).toBe(before)
      expect(() => process.kill(worker!.pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
      expect(
        (await readdir(root)).filter((name) => name.startsWith('.next-test-'))
      ).toEqual([])
    } finally {
      if (child.exitCode === null) {
        if (process.platform === 'win32') child.kill('SIGTERM')
        else {
          try {
            process.kill(-child.pid!, 'SIGTERM')
          } catch (error) {
            if (error.code !== 'ESRCH') throw error
          }
        }
      }
      const exit = await ended
      if (evidenceDirectory)
        await writeFile(
          join(evidenceDirectory, `cancel-${phase}.json`),
          JSON.stringify(
            {
              phase,
              worker,
              exit,
              stdout,
              stderr,
              after: await readFile(snapshot, 'utf8'),
            },
            null,
            2
          )
        )
    }
  },
  60000
)

it.each(['default', 'help', 'filter'] as const)(
  '8 PTY: interactive %s behavior matches the pinned CLI',
  async (action) => {
    const contract = contracts.find(
      (item) => item.id === 'workspace-helper-state'
    )!
    const results = {} as Record<
      Runner,
      { completed: boolean; code: number; stages: string[]; raw: string }
    >
    for (const runner of ['vitest', 'next'] as const) {
      const root = await prepare(contract, runner, `pty-${action}`)
      await writeFile(
        join(root, 'contract.case.mjs'),
        "import {test,expect} from 'vitest';test('first',()=>{console.log('RELEASE_BODY=first');expect(42).toBe(42)});test('second',()=>{console.log('RELEASE_BODY=second');expect(42).toBe(42)})\n"
      )
      const config = join(referenceRoot, `pty-${action}.config.mjs`)
      await writeFile(
        config,
        "export default {test:{include:['*.case.mjs']}}\n"
      )
      const args =
        runner === 'vitest'
          ? [process.execPath, referenceBin, '--root', root, '--config', config]
          : [process.execPath, nextBin, 'test', root]
      if (action !== 'default') args.push('--watch')
      const result = await output(
        'python3',
        [
          join(__dirname, 'pty-driver.py'),
          JSON.stringify({ args, cwd: root, action, ordinaryTerminal: true }),
        ],
        root
      )
      if (result.code !== 0)
        throw new Error(
          `PTY DRIVER FAILED (${runner})\n${result.stdout}${result.stderr}`
        )
      results[runner] = JSON.parse(result.stdout)
    }
    if (evidenceDirectory)
      await writeFile(
        join(evidenceDirectory, `pty-${action}.json`),
        JSON.stringify(results, null, 2)
      )
    expect(results.vitest.completed).toBe(true)
    expect(results.next.completed).toBe(true)
    if (action === 'filter') {
      const final = results.next.stages.at(-1)!
      expect(final).toContain('RELEASE_BODY=second')
      expect(final).not.toContain('RELEASE_BODY=first')
    }
  },
  90000
)

it.each(['run', 'agent', 'ci'] as const)(
  '8 PTY: %s defaults execute once through both public commands',
  async (mode) => {
    const contract = contracts.find(
      (item) => item.id === 'workspace-helper-state'
    )!
    for (const runner of ['vitest', 'next'] as const) {
      const root = await prepare(contract, runner, `pty-once-${mode}`)
      await writeFile(
        join(root, 'contract.case.mjs'),
        "import {test,expect} from 'vitest';import {appendFileSync} from 'node:fs';test('once',()=>{appendFileSync('once-marker.txt','once\\n');console.log('RELEASE_BODY=once');expect(42).toBe(42)})\n"
      )
      const config = join(referenceRoot, `pty-once-${mode}.config.mjs`)
      await writeFile(
        config,
        "export default {test:{include:['*.case.mjs']}}\n"
      )
      const args =
        runner === 'vitest'
          ? [process.execPath, referenceBin, '--root', root, '--config', config]
          : [process.execPath, nextBin, 'test', root]
      if (mode === 'run') args.push('--run')
      const result = await output(
        'python3',
        [
          join(__dirname, 'pty-driver.py'),
          JSON.stringify({
            args,
            cwd: root,
            action: 'default',
            ordinaryTerminal: true,
            environment:
              mode === 'agent'
                ? { AI_AGENT: 'codex' }
                : mode === 'ci'
                  ? { CI: '1' }
                  : {},
          }),
        ],
        root
      )
      expect(result.code).toBe(0)
      const terminal = JSON.parse(result.stdout)
      if (evidenceDirectory)
        await writeFile(
          join(evidenceDirectory, `pty-once-${mode}-${runner}.json`),
          JSON.stringify(terminal, null, 2)
        )
      expect(terminal.code).toBe(0)
      expect(terminal.completed).toBe(false)
      expect(await readFile(join(root, 'once-marker.txt'), 'utf8')).toBe(
        'once\n'
      )
      expect(terminal.raw).not.toMatch(/(?:waiting|watching) for file changes/i)
    }
  },
  90000
)

it.each(['browser', 'parallel'] as const)(
  '6/8 watch: %s execution reruns the actual affected tests',
  async (profile) => {
    const expected = await watchProbe(
      'vitest',
      `watch-${profile}`,
      'source',
      profile === 'browser' ? 'browser' : 'node',
      profile === 'parallel'
    )
    const actual = await watchProbe(
      'next',
      `watch-${profile}`,
      'source',
      profile === 'browser' ? 'browser' : 'node',
      profile === 'parallel'
    )
    expect(actual).toEqual(expected)
  },
  90000
)
