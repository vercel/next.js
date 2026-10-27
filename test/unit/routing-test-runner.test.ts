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
