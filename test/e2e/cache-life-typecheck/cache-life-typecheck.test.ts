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

    await retry(async () => {
      await next.readFile(`${next.distDir}/types/cache-life.d.ts`)
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
