import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('layout-dynamic-import-hmr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should pick up edits to a file that is dynamically imported from a layout', async () => {
    const $ = await next.render$('/en')
    expect($('#subtitle').text()).toBe('original')

    await next.patchFile(
      'messages/en.json',
      JSON.stringify({ subtitle: 'updated' }, null, 2),
      async () => {
        await retry(async () => {
          const $updated = await next.render$('/en')
          expect($updated('#subtitle').text()).toBe('updated')
        })
      }
    )
  })
})
