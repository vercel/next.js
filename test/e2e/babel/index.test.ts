import path from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

// @force-gate !futureCompat || !start || turbopack
describe('Babel', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    dependencies: {
      '@babel/preset-flow': '7.25.9',
    },
  })

  it('Should compile a page with flowtype correctly', async () => {
    if (
      await gate(
        (conditions) =>
          conditions.futureCompat && conditions.dev && conditions.rspack
      )
    ) {
      await expect(next.fetch('/')).rejects.toThrow('fetch failed')
      await retry(() => {
        expect(next.cliOutput).toContain('DEP0111')
        expect(next.cliOutput).toContain('process.binding()')
      })
      return
    }
    const $ = await next.render$('/')
    expect($('#text').text()).toBe('Test Babel')
  })
})
