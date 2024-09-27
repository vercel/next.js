import { nextTestSetup } from 'e2e-utils'
import { existsSync } from 'node:fs'
import { join } from 'path'

describe('next-codemod', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { '@next/codemod': 'canary' },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    const nextCodemodPath = join(
      next.testDir,
      'node_modules',
      '@next',
      'codemod',
      'bin',
      'next-codemod.js'
    )
    expect(existsSync(nextCodemodPath)).toBeTruthy()
    expect($('p').text()).toBe('hello world')
  })
})
