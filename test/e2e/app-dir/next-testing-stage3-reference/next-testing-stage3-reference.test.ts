import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const exec = promisify(execFile)
const nativeDirectory = join(__dirname, '../../../../packages/next-swc/native')

async function emittedJavaScript(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) return emittedJavaScript(file)
      return entry.isFile() && entry.name.endsWith('.js')
        ? [await readFile(file, 'utf8')]
        : []
    })
  )
  return contents.flat()
}

// Requires the actual local production build and emitted output inspection.
// @force-gate start && turbopack
describe('next-testing-stage3-reference', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { NEXT_TEST_NATIVE_DIR: nativeDirectory },
  })

  beforeAll(async () => {
    await cp(
      join(next.testDir, 'conditions'),
      join(next.testDir, 'node_modules/next-testing-stage3-conditions'),
      { recursive: true }
    )
  })

  it('rejects coverage combined with snapshot updates before executing the case', async () => {
    await exec(
      process.execPath,
      [
        join(next.testDir, 'run-coverage-update-rejection.mjs'),
        join(__dirname, '../next-testing-package/process-supervisor.mjs'),
      ],
      { cwd: next.testDir, timeout: 45000, maxBuffer: 10 * 1024 * 1024 }
    )
  })

  it('runs isolated production Node tests before building the ordinary route oracle', async () => {
    const { stdout } = await exec(
      process.execPath,
      [
        join(next.testDir, 'run-cli.mjs'),
        join(__dirname, '../next-testing-package/process-supervisor.mjs'),
      ],
      {
        cwd: next.testDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NEXT_TEST_NATIVE_DIR: nativeDirectory,
        },
        timeout: 200000,
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    expect(stdout).toMatch(/Test Files\s+2 passed(?:\s|$)/)
    expect(stdout).toMatch(/Tests\s+2 passed(?:\s|$)/)
    const result = JSON.parse(
      await readFile(join(next.testDir, 'l3-production-result.json'), 'utf8')
    )
    expect(result.status).toBe(0)
    await next.start()
    const $ = await next.render$('/')
    expect($('#profile').text()).toBe('L3_PRODUCTION_BRANCH:production')
    expect($('#server-value').text()).toBe('L3_SERVER_ONLY_VALUE')
    expect($('#counter').text()).toBe('Count: 10')
    expect($('#visitor').text()).toBe('anonymous')
    const visitors = await Promise.all(
      ['alice', 'bob'].map((visitor) =>
        next.render$('/', {}, { headers: { cookie: `l3-visitor=${visitor}` } })
      )
    )
    visitors.forEach((page, index) => {
      expect(page('#visitor').text()).toBe(['alice', 'bob'][index])
      expect(page('#server-value').text()).toBe('L3_SERVER_ONLY_VALUE')
      expect(page('#counter').text()).toBe('Count: 10')
    })
    const scripts = [
      ...(await emittedJavaScript(join(next.testDir, '.next/server'))),
      ...(await emittedJavaScript(join(next.testDir, '.next/static'))),
    ]
    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) {
      expect(script).not.toContain('L3_DEVELOPMENT_BRANCH_MUST_BE_ELIMINATED')
      expect(script).not.toContain(
        'uses production conditions and completed setup in file A'
      )
      expect(script).not.toContain('has a fresh evaluation realm in file B')
    }
    const trace = JSON.parse(
      await readFile(
        join(next.testDir, '.next/server/app/page.js.nft.json'),
        'utf8'
      )
    )
    expect(trace.files.length).toBeGreaterThan(0)
    expect(trace.files.join('\n')).not.toMatch(
      /experimental\/testing\/|compiled\/next-test-primitives\/|node_modules\/(?:vitest|vite)\//
    )
  })
  it('validates the internal production RSC producer against the same route subject', async () => {
    await next.stop()
    const { stdout } = await exec(
      process.execPath,
      [
        join(next.testDir, 'run-rsc-owned.mjs'),
        join(__dirname, '../next-testing-package/process-supervisor.mjs'),
      ],
      {
        cwd: next.testDir,
        env: { ...process.env, NEXT_TEST_NATIVE_DIR: nativeDirectory },
        timeout: 200000,
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    expect(stdout).toContain('L3_INTERNAL_PRODUCTION_RSC_PASSED')
  })
})
