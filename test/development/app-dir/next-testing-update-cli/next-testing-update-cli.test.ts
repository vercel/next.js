import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import config from './next.test.config.json'

const original =
  '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`selected snapshot 1`] = `"previous"`;\n\nexports[`skipped snapshot 1`] = `"preserved"`;\n\nexports[`unrelated 1`] = `"unrelated"`;\n'
const spec = (profile: 'node' | 'rsc') => `${
  profile === 'rsc' ? "import 'server-only'\n" : ''
}import { expect, test } from 'vitest'

test('selected snapshot', () => {
  expect('updated').toMatchSnapshot()
  expect({ inline: '${profile}' }).toMatchInlineSnapshot()
  expect('raw ${profile}').toMatchFileSnapshot('./${profile}.raw.txt')
  if (process.env.NEXT_TEST_UPDATE_FAIL === '1')
    throw new Error('Failure after staged snapshot')
})

test.skip('skipped snapshot', () => expect('ignored').toMatchSnapshot())
`

describe('next-testing-update-cli', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })
  let auditDir: string
  const snapshot = (profile: string) =>
    join(next.testDir, 'specs', '__snapshots__', `${profile}.mjs.snap`)

  beforeEach(async () => {
    auditDir = await mkdtemp(join(tmpdir(), 'next-testing-update-audit-'))
    await next.patchFile('next.test.config.json', JSON.stringify(config))
    await mkdir(join(next.testDir, 'specs', '__snapshots__'), {
      recursive: true,
    })
    for (const profile of ['node', 'rsc'] as const) {
      await next.patchFile(`specs/${profile}.mjs`, spec(profile))
      await writeFile(snapshot(profile), original)
      await rm(join(next.testDir, 'specs', `${profile}.raw.txt`), {
        force: true,
      })
    }
  })
  afterEach(async () => {
    await rm(auditDir, { recursive: true, force: true })
  })

  async function run(args: string[], flags: Record<string, string> = {}) {
    const auditPath = join(auditDir, `${randomUUID()}.jsonl`)
    const result = await new Promise<{ code: number; output: string }>(
      (resolve, reject) => {
        execFile(
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
              ...flags,
              NODE_ENV: 'development',
              NODE_OPTIONS: [
                process.env.NODE_OPTIONS,
                `--require=${join(next.testDir, 'native-audit.cjs')}`,
              ]
                .filter(Boolean)
                .join(' '),
              NEXT_TEST_NATIVE_AUDIT: auditPath,
            },
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60000,
          },
          (error, stdout, stderr) => {
            if (error && typeof error.code !== 'number') reject(error)
            else
              resolve({
                code: typeof error?.code === 'number' ? error.code : 0,
                output: stdout + stderr,
              })
          }
        )
      }
    )
    const nativeSource = await readFile(auditPath, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    const natives = nativeSource
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    if (process.env.NEXT_TEST_UPDATE_EVIDENCE_DIR) {
      await mkdir(process.env.NEXT_TEST_UPDATE_EVIDENCE_DIR, {
        recursive: true,
      })
      await writeFile(
        join(process.env.NEXT_TEST_UPDATE_EVIDENCE_DIR, `${randomUUID()}.json`),
        JSON.stringify({ args, ...result, natives }, null, 2)
      )
    }
    return { ...result, natives }
  }

  it('keeps default Node and RSC snapshots byte-identical, then updates only on explicit opt-in', async () => {
    const readonly = await run(['--run'])
    expect(readonly.code).toBe(1)
    expect(readonly.natives.length).toBeGreaterThan(0)
    for (const profile of ['node', 'rsc'])
      expect(await readFile(snapshot(profile), 'utf8')).toBe(original)
    const updated = await run(['--run', '--update'])
    expect(updated.code).toBe(0)
    expect(updated.output).toMatch(/Test Files\s+2 passed(?:\s|$)/)
    expect(updated.natives.length).toBeGreaterThan(0)
    for (const profile of ['node', 'rsc']) {
      const source = await readFile(snapshot(profile), 'utf8')
      expect(source).toContain('exports[`selected snapshot 1`] = `"updated"`')
      expect(source).toContain('exports[`skipped snapshot 1`] = `"preserved"`')
      expect(source).toContain('exports[`unrelated 1`] = `"unrelated"`')
      expect(
        await readFile(join(next.testDir, 'specs', `${profile}.mjs`), 'utf8')
      ).toContain(`inline: "${profile}"`)
      expect(
        await readFile(
          join(next.testDir, 'specs', `${profile}.raw.txt`),
          'utf8'
        )
      ).toBe(`raw ${profile}`)
    }
  })

  it.each(['node', 'rsc'])(
    'does not write staged snapshots after a failed %s file',
    async (profile) => {
      const result = await run(['--update', '--project', profile], {
        NEXT_TEST_UPDATE_FAIL: '1',
      })
      expect(result.code).toBe(1)
      expect(result.output).toContain('Failure after staged snapshot')
      expect(result.natives.length).toBeGreaterThan(0)
      for (const name of ['node', 'rsc'])
        expect(await readFile(snapshot(name), 'utf8')).toBe(original)
      expect(
        await readFile(join(next.testDir, 'specs', `${profile}.mjs`), 'utf8')
      ).toBe(spec(profile as 'node' | 'rsc'))
      await expect(
        readFile(join(next.testDir, 'specs', `${profile}.raw.txt`), 'utf8')
      ).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it.each(['node', 'rsc'] as const)(
    'updates external, inline, and raw snapshots in a production %s profile',
    async (profile) => {
      await next.patchFile(
        'next.test.config.json',
        JSON.stringify({
          projects: [
            {
              name: profile,
              environment: profile,
              mode: 'production',
              include: [`specs/${profile}.mjs`],
            },
          ],
        })
      )
      const result = await run(['--run', '--update'])
      expect(result.code).toBe(0)
      expect(await readFile(snapshot(profile), 'utf8')).toContain('`"updated"`')
      expect(
        await readFile(join(next.testDir, 'specs', `${profile}.mjs`), 'utf8')
      ).toContain(`inline: "${profile}"`)
      expect(
        await readFile(
          join(next.testDir, 'specs', `${profile}.raw.txt`),
          'utf8'
        )
      ).toBe(`raw ${profile}`)
    }
  )

  it('updates browser-driver snapshots after its owned resources close', async () => {
    await next.patchFile(
      'next.test.config.json',
      JSON.stringify({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            include: ['specs/node.mjs'],
          },
        ],
      })
    )
    const result = await run(['--run', '--update'])
    expect(result.code).toBe(0)
    expect(await readFile(snapshot('node'), 'utf8')).toContain('`"updated"`')
    expect(
      await readFile(join(next.testDir, 'specs/node.mjs'), 'utf8')
    ).toContain('inline: "node"')
    expect(
      await readFile(join(next.testDir, 'specs/node.raw.txt'), 'utf8')
    ).toBe('raw node')
  })

  it('rejects incompatible update switches before any snapshot changes', async () => {
    await next.patchFile(
      'next.test.config.json',
      JSON.stringify({
        projects: [
          ...config.projects,
          {
            name: 'browser',
            environment: 'browser',
            include: ['specs/node.mjs'],
          },
        ],
      })
    )
    for (const args of [
      ['--list', '--update'],
      ['--watch', '--update'],
    ]) {
      const result = await run(args)
      expect(result.code).toBe(1)
      expect(result.output).toMatch(/cannot be combined/)
      expect(result.natives).toEqual([])
      for (const name of ['node', 'rsc'])
        expect(await readFile(snapshot(name), 'utf8')).toBe(original)
    }
  })
})
