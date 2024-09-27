import { nextTestSetup } from 'e2e-utils'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'path'

describe('next-codemod', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { '@next/codemod': 'canary' },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect(existsSync(next.testDir)).toBe(true)
    const n = join(next.testDir, 'node_modules')
    expect(existsSync(n)).toBe(true)
    const ne = join(n, '@next')
    expect(existsSync(ne)).toBe(true)
    const c = join(ne, 'codemod')
    expect(existsSync(c)).toBe(true)
    let output = ''
    const files = await readdir(c, { withFileTypes: true, recursive: true })
    files.forEach((file) => {
      if (file.isDirectory()) {
        output += file.path + '\n'
      }
      if (file.isFile()) {
        output += file.path + '/' + file.name + '\n'
      }
    })
    expect(output).toBe('')

    const b = join(c, 'bin')
    expect(existsSync(b)).toBe(true)
    const nc = join(b, 'next-codemod.js')
    expect(existsSync(nc)).toBe(true)
    expect($('p').text()).toBe('hello world')
  })
})
