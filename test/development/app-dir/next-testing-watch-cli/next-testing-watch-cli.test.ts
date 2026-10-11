import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import config from './next.test.config.json'

const exec = promisify(execFile)

describe('next-testing-watch-cli', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it.each(['hang', 'leak'])(
    'bounds a public CLI %s and reclaims its recorded detached descendant',
    async (mode) => {
      const { stdout } = await exec(
        process.execPath,
        [join(next.testDir, 'stuck-driver.cjs'), mode],
        { cwd: next.testDir, timeout: 20000 }
      )
      expect(stdout).toContain('STUCK_CLI_CLEANED')
    }
  )

  it.each(['reload', 'crash', 'public-node', 'public-rsc'])(
    'owns real compiler and file-worker lifetimes during %s',
    async (mode) => {
      const auditDir = await mkdtemp(
        join(tmpdir(), 'next-testing-watch-audit-')
      )
      try {
        const { stdout } = await exec(
          process.execPath,
          [
            join(next.testDir, 'watch-driver.cjs'),
            mode,
            join(
              __dirname,
              '../../../e2e/app-dir/next-testing-package/result-events.cjs'
            ),
          ],
          {
            cwd: next.testDir,
            env: {
              ...process.env,
              NODE_ENV: 'development',
              NODE_OPTIONS: [
                process.env.NODE_OPTIONS,
                `--require=${join(next.testDir, 'native-audit.cjs')}`,
              ]
                .filter(Boolean)
                .join(' '),
              NEXT_TEST_NATIVE_AUDIT: join(auditDir, 'native.jsonl'),
              NEXT_TEST_WATCH_CRASH: mode === 'crash' ? '1' : '',
            },
            maxBuffer: 10 * 1024 * 1024,
            timeout: 90000,
          }
        )
        const marker = 'NEXT_TEST_WATCH_RESULT='
        const line = stdout
          .split('\n')
          .find((value) => value.startsWith(marker))
        expect(line).toBeDefined()
        const result = JSON.parse(line!.slice(marker.length))
        expect(result.natives.length).toBeGreaterThan(0)
        expect(result.result.status).toBe(
          mode === 'crash' ? 'failed' : 'cancelled'
        )
        if (mode !== 'crash') expect(result.passed).toEqual(['first', 'second'])
        if (mode.startsWith('public-')) {
          expect(result.output).toContain(' DEV  Next.js')
          expect(result.output).toContain(' RERUN  Next.js')
          expect(result.output).toContain(' PASS  Waiting for file changes...')
          expect(result.output).toMatch(/Test Files\s+1 passed \(1\)/)
        }
        if (mode === 'crash') {
          expect(result.output).not.toContain('Waiting for file changes...')
          expect(result.output).not.toContain('Watching for file changes...')
        }
        if (process.env.NEXT_TEST_WATCH_EVIDENCE_DIR) {
          await mkdir(process.env.NEXT_TEST_WATCH_EVIDENCE_DIR, {
            recursive: true,
          })
          await writeFile(
            join(process.env.NEXT_TEST_WATCH_EVIDENCE_DIR, `${mode}.json`),
            JSON.stringify(result, null, 2)
          )
        }
      } finally {
        await rm(auditDir, { recursive: true, force: true })
      }
    }
  )

  it('rejects unsupported public watch profiles and updates before native compilation', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'next-testing-watch-guards-'))
    const auditPath = join(auditDir, 'native.jsonl')
    try {
      for (const [profile, args, message] of [
        [{ environment: 'browser' }, ['--watch'], /Browser watch requires/],
        [{ mode: 'production' }, ['--watch'], /route-less development/],
        [{ route: '/page' }, ['--watch'], /route-less development/],
        [{}, ['--watch', '--update'], /cannot be combined/],
      ] as const) {
        await next.patchFile(
          'next.test.config.json',
          JSON.stringify({ projects: [{ ...config.projects[0], ...profile }] })
        )
        await expect(
          exec(
            process.execPath,
            [
              join(next.testDir, 'node_modules/next/dist/bin/next'),
              'test',
              next.testDir,
              ...args,
            ],
            {
              cwd: next.testDir,
              env: {
                ...process.env,
                NODE_ENV: 'development',
                NODE_OPTIONS: `--require=${join(next.testDir, 'native-audit.cjs')}`,
                NEXT_TEST_NATIVE_AUDIT: auditPath,
              },
              timeout: 15000,
            }
          )
        ).rejects.toMatchObject({
          code: 1,
          stderr: expect.stringMatching(message),
        })
        await expect(readFile(auditPath, 'utf8')).rejects.toMatchObject({
          code: 'ENOENT',
        })
      }
    } finally {
      await next.patchFile('next.test.config.json', JSON.stringify(config))
      await rm(auditDir, { recursive: true, force: true })
    }
  })
})
