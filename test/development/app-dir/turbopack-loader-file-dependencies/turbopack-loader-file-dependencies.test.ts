import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('turbopack-loader-file-dependencies', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should update when the dependency file changes', async () => {
    const $ = await next.render$('/')
    const initialText = await $('p').text()
    expect(initialText).toBeTruthy()

    await next.patchFile(
      'utils/file-dependency.ts',
      'export const magicValue = "magic-value-2";'
    )

    await waitFor(1000)

    const $2 = await next.render$('/')
    const newText = await $2('p').text()
    expect(newText).not.toBe(initialText)
  })

  it('should update when a missing dependency is created', async () => {
    const $ = await next.render$('/')
    const initialText = $('p').text()
    expect(initialText).toContain('missing dependency: false')

    await next.patchFile(
      'utils/missing-dependency.ts',
      'export const value = "created"',
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/')
          expect($2('p').text()).toContain('missing dependency: true')
        })
      }
    )
  })

  it('should update when a build dependency changes', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toContain('build dependency: build-one')

    await next.patchFile(
      'utils/build-dependency.js',
      "module.exports = 'build-two'",
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/')
          expect($2('p').text()).toContain('build dependency: build-two')
        }, 10000)
      }
    )
  })

  // @force-gate turbopack
  it('warns for unsupported build dependency inputs', async () => {
    const outputIndex = next.cliOutput.length
    const $ = await next.render$('/unsupported')
    expect($('p').text()).toContain('unsupported build dependency')
    await retry(() => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain('Unsupported webpack loader build dependency')
      expect(output).toContain('/utils')
      expect(output).toContain('exact existing file')
      expect(output).not.toMatch(/EISDIR|ELOOP/)
    })
  })
})
