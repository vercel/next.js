import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

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
      'export const value = "created"'
    )

    await waitFor(1000)

    const $2 = await next.render$('/')
    expect($2('p').text()).toContain('missing dependency: true')
  })
})
