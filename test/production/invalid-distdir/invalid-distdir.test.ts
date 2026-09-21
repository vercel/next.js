/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

describe('invalid distDir', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) return

  beforeEach(async () => {
    await next.stop()
    await next.remove('.next')
    await next.remove('not-a-build-dir')
  })

  afterAll(async () => {
    await next.remove('not-a-build-dir')
  })

  it('refuses a distDir outside the application and workspace', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: '../..' }`,
      async () => {
        const { cliOutput } = await next.build()

        expect(cliOutput).toContain(
          'should be inside of the application directory'
        )
      }
    )
  })

  it('refuses a distDir that is the application directory itself', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: '.' }`,
      async () => {
        const { cliOutput } = await next.build()

        // Caught by one of the two checks depending on whether the app is its
        // own workspace: containment when it is, ownership when it is not.
        expect(cliOutput).toMatch(
          /should be inside of the application directory|does not appear to have been created by Next\.js/
        )
        // The application's own source is untouched.
        expect(await next.hasFile('pages/index.tsx')).toBe(true)
      }
    )
  })

  it('refuses to clean a distDir holding unrelated files', async () => {
    await next.patchFile('not-a-build-dir/important.txt', 'user data')
    await next.patchFile('not-a-build-dir/nested/source.js', 'more user data')

    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir' }`,
      async () => {
        const { cliOutput } = await next.build()

        expect(cliOutput).toContain(
          'does not appear to have been created by Next.js'
        )

        // Nothing was deleted.
        expect(await next.readFile('not-a-build-dir/important.txt')).toBe(
          'user data'
        )
        expect(await next.readFile('not-a-build-dir/nested/source.js')).toBe(
          'more user data'
        )
      }
    )
  })

  // `cleanDistDir: false` is a legacy escape hatch from Next 11, when cleaning
  // became the default. It skips cleaning entirely, so the guard never runs.
  it('refuses an unrecognized distDir in generate mode', async () => {
    // Generate mode resumes from a distDir a previous compile produced, so it
    // never cleans. It should still report a misconfigured distDir rather than
    // failing later on a missing BUILD_ID.
    await next.patchFile('not-a-build-dir/important.txt', 'user data')

    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir' }`,
      async () => {
        const { cliOutput } = await next.build({
          args: ['--experimental-build-mode', 'generate'],
        })

        expect(cliOutput).toContain(
          'does not appear to have been created by Next.js'
        )
        expect(cliOutput).not.toContain('BUILD_ID')
        expect(await next.readFile('not-a-build-dir/important.txt')).toBe(
          'user data'
        )
      }
    )
  })

  it('refuses an unrecognized distDir even when cleaning is disabled', async () => {
    // `cleanDistDir: false` disables deleting, not the requirement that
    // distDir be a directory Next.js owns.
    await next.patchFile('not-a-build-dir/important.txt', 'user data')

    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir', cleanDistDir: false }`,
      async () => {
        const { cliOutput } = await next.build()

        expect(cliOutput).toContain(
          'does not appear to have been created by Next.js'
        )
        expect(await next.readFile('not-a-build-dir/important.txt')).toBe(
          'user data'
        )
      }
    )
  })

  it('builds into a Next.js-created distDir when cleaning is disabled', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir' }`,
      async () => {
        expect((await next.build()).exitCode).toBe(0)
      }
    )

    // Stale output from that build is kept rather than cleaned.
    await next.patchFile('not-a-build-dir/stale-output.txt', 'stale')

    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir', cleanDistDir: false }`,
      async () => {
        expect((await next.build()).exitCode).toBe(0)
        expect(await next.hasFile('not-a-build-dir/stale-output.txt')).toBe(
          true
        )
      }
    )
  })

  it('cleans an empty distDir', async () => {
    await next.patchFile('not-a-build-dir/.gitkeep', '')

    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir' }`,
      async () => {
        const { exitCode } = await next.build()

        expect(exitCode).toBe(0)
        expect(await next.hasFile('not-a-build-dir/BUILD_ID')).toBe(true)
      }
    )
  })

  it('cleans a distDir from a previous build', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir' }`,
      async () => {
        expect((await next.build()).exitCode).toBe(0)

        // Stale output from the first build should be removed by the second.
        await next.patchFile('not-a-build-dir/stale-output.txt', 'stale')

        expect((await next.build()).exitCode).toBe(0)
        expect(await next.hasFile('not-a-build-dir/stale-output.txt')).toBe(
          false
        )
      }
    )
  })
})
