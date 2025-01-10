import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, assertNoRedbox } from 'next-test-utils'

describe('develop - app-dir - edge errros hmr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should recover from build errors when server component error', async () => {
    const browser = await next.browser('/')
    const clientComponentSource = await next.readFile('app/comp.server.js')

    await next.patchFile('app/comp.server.js', (content) => {
      return content.replace('{/* < */}', '<') // uncomment
    })

    await assertHasRedbox(browser)

    await next.patchFile('app/comp.server.js', clientComponentSource)

    await assertNoRedbox(browser)
  })

  it('should recover from build errors when client component error', async () => {
    const browser = await next.browser('/')
    const clientComponentSource = await next.readFile('app/comp.client.js')

    await next.patchFile('app/comp.client.js', (content) => {
      return content.replace('{/* < */}', '<') // uncomment
    })

    await assertHasRedbox(browser)

    await next.patchFile('app/comp.client.js', clientComponentSource)

    await assertNoRedbox(browser)
  })
})
