import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import execa from 'execa'

describe('cache-life-typecheck', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('accepts configured cacheLife profiles and rejects unknown ones', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    // Route types are shared by all commands. `next dev` writes an empty
    // placeholder first, so wait for the generated types.
    await retry(async () => {
      expect(await next.readFile('.next/types/cache-life.d.ts')).not.toContain(
        'Types are being generated'
      )
    }, 10_000)

    await next.stop()
    try {
      const { stdout, stderr } = await execa('pnpm', ['tsc', '--noEmit'], {
        cwd: next.testDir,
        reject: false,
      })

      expect({ stdout, stderr }).toEqual({ stdout: '', stderr: '' })
    } finally {
      await next.start()
    }
  })
})
