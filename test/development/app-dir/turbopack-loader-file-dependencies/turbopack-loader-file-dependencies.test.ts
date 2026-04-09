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
})
