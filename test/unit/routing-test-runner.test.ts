import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import execa from 'execa'

jest.setTimeout(60_000)

const root = path.resolve(__dirname, '../..')

describe('routing suite execution', () => {
  let directory: string

  beforeEach(async () => {
    // These tiny unit fixtures exercise the scheduler without installing an
    // application or launching a browser. Each test owns its scratch files.
    directory = await mkdtemp(path.join(__dirname, '.routing-runner-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function run(
    selections: { file: string; testNamePattern?: string }[],
    jestArgs: string[] = []
  ) {
    const manifest = path.join(directory, 'suites.json')
    await writeFile(manifest, JSON.stringify(selections))
    const config = path.join(directory, 'jest.config.json')
    await writeFile(
      config,
      JSON.stringify({
        rootDir: directory,
        transform: {},
        testEnvironment: 'node',
      })
    )
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      CI: '',
      NEXT_TEST_JOB: '',
      NEXT_EXTERNAL_TESTS_FILTERS: '',
      NEXT_TEST_SKIP_RESULT_CACHE: '1',
    }
    delete environment.NEXT_TEST_STARTER
    delete environment.NEXT_TEST_PKG_PATHS

    const result = await execa(
      process.execPath,
      [
        'run-tests.js',
        '--suite-list',
        manifest,
        '--concurrency',
        '2',
        '--retries',
        '0',
        '--local',
        '--jest-args',
        JSON.stringify(['--config', config, ...jestArgs]),
      ],
      { cwd: root, env: environment, reject: false }
    )
    return { ...result, output: result.stdout + result.stderr }
  }

  async function fixture(name: string, contents: string) {
    const file = path.join(directory, `${name}.test.js`)
    await writeFile(file, contents)
    return path.relative(root, file).split(path.sep).join('/')
  }

  async function selection(...args: string[]) {
    return execa(
      process.execPath,
      ['scripts/run-routing-tests.mjs', '--list', ...args],
      { cwd: root, reject: false }
    )
  }

  it('selects indexed suites at their original paths and keeps HTTP and Router groups separate', async () => {
    const router = await selection('--core', '--group=router', '--mode=start')
    expect(router.exitCode).toBe(0)
    expect(router.stdout).toContain('test/e2e/basepath/basepath.test.ts\n')
    expect(router.stdout).toContain(
      'test/e2e/app-dir/parallel-routes-and-interception/parallel-routes-and-interception.test.ts\n'
    )
    expect(router.stdout).toContain(
      'test/e2e/routing-server/router/docs-router-contract/docs-router-contract.test.ts\n'
    )
    expect(router.stdout).not.toContain('routing-server/router/basepath/')
    expect(router.stdout).not.toContain('middleware-responses/')
    // A broader companion's focused cases stay outside the whole-file profile.
    expect(router.stdout).not.toContain('test/e2e/app-dir/app/index.test.ts')

    const http = await selection('--core', '--group=http', '--mode=start')
    expect(http.exitCode).toBe(0)
    expect(http.stdout).toContain(
      'test/e2e/middleware-responses/test/index.test.ts\n'
    )
    expect(http.stdout).toContain(
      'test/e2e/routing-server/http/docs-http-contract/docs-http-contract.test.ts\n'
    )
    expect(http.stdout).not.toContain('test/e2e/basepath/')
  })

  it('keeps architecture companions separate and respects native API bundler scope', async () => {
    const turbo = await selection(
      '--regressions=A',
      '--mode=dev',
      '--bundler=turbo'
    )
    expect(turbo.exitCode).toBe(0)
    expect(turbo.stdout).toContain('test/development/basic/next-rs-api.test.ts')
    expect(turbo.stdout).toContain('reports route kinds')
    expect(turbo.stdout).not.toContain('writeToDisk multiple times')
    const webpack = await selection(
      '--regressions=A',
      '--mode=dev',
      '--bundler=webpack'
    )
    expect(webpack.exitCode).toBe(0)
    expect(webpack.stdout).toContain(
      'test/development/empty-project/empty-project.test.ts'
    )
    expect(webpack.stdout).not.toContain('next-rs-api.test.ts')
    const ordinary = await selection('--mode=dev')
    expect(ordinary.exitCode).toBe(0)
    expect(ordinary.stdout).not.toContain('next-rs-api.test.ts')
  })

  it('selects explicit dev cases even when their fixture lives under production', async () => {
    const dev = await selection('--regressions=E', '--mode=dev')
    expect(dev.exitCode).toBe(0)
    expect(dev.stdout).toContain(
      'graceful-shutdown/index.test.ts [cases: (?:Graceful Shutdown development)]'
    )
    expect(dev.stdout).not.toContain('Graceful Shutdown production')
    const start = await selection('--regressions=E', '--mode=start')
    expect(start.exitCode).toBe(0)
    expect(start.stdout).toContain('Graceful Shutdown production')
    expect(start.stdout).not.toContain('Graceful Shutdown development')
  })

  it('rejects incompatible profiles and explicit unsupported dimensions', async () => {
    for (const args of [
      ['--regressions=I'],
      ['--regressions=A', '--full'],
      ['--regressions=A', '--group=router'],
      ['--regressions=A', '--mode=start'],
    ]) {
      expect((await selection(...args)).exitCode).not.toBe(0)
    }
    const applicable = await selection('--regressions=A')
    expect(applicable.exitCode).toBe(0)
    expect(applicable.stdout).toContain(
      'No applicable regression companions for start'
    )
    expect(applicable.stdout).toContain('next-rs-api.test.ts')
  })

  it('intersects developer filters with routing selections', async () => {
    const file = await fixture(
      'filtering',
      `it('routing chosen', () => expect(true).toBe(true))
       it('routing other', () => { throw new Error('unrequested routing case') })
       it('unrelated chosen', () => { throw new Error('unrelated feature') })`
    )
    const result = await run(
      [{ file, testNamePattern: 'routing ' }],
      ['-t', 'chosen$']
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(
      'Selected assertions: 1 passed, 0 failed, 1 skipped'
    )
  })

  it('fails when a focused selector no longer matches registered tests', async () => {
    const file = await fixture(
      'renamed',
      `it('renamed behavior', () => expect(true).toBe(true))`
    )
    const result = await run([{ file, testNamePattern: 'original behavior' }])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('No test names match the routing selection')
  })

  it('runs isolated suites concurrently', async () => {
    const files = await Promise.all(
      ['first', 'second'].map((name, index, names) =>
        fixture(
          name,
          `const fs = require('node:fs')
           it('meets the other worker at a release barrier', async () => {
             await new Promise((resolve, reject) => {
               const other = ${JSON.stringify(path.join(directory, names[1 - index]))}
               fs.watchFile(other, { interval: 10 }, done)
               const timeout = setTimeout(() => {
                 fs.unwatchFile(other, done)
                 reject(new Error('The other suite did not run concurrently'))
               }, 10000)
               function done() {
                 if (fs.existsSync(other)) {
                   fs.unwatchFile(other, done)
                   clearTimeout(timeout)
                   resolve()
                 }
               }
               fs.writeFileSync(${JSON.stringify(path.join(directory, name))}, 'ready')
               done()
             })
           })`
        )
      )
    )
    const result = await run(
      files.map((file) => ({ file })),
      ['--testTimeout=15000']
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(
      'Selected assertions: 2 passed, 0 failed, 0 skipped'
    )
  })

  it('finishes other suites and fails the command when an assertion fails', async () => {
    const failed = await fixture(
      'failed',
      `it('reports a regression', () => expect('actual').toBe('expected'))`
    )
    const passed = await fixture(
      'passed',
      `it('still runs', () => expect(true).toBe(true))`
    )
    const result = await run([{ file: failed }, { file: passed }])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'Selected assertions: 1 passed, 1 failed, 0 skipped'
    )
    expect(await readFile(failed, 'utf8')).toContain('reports a regression')
  })
})
