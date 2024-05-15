import { nextTestSetup } from 'e2e-utils'
import { hasRedbox } from 'next-test-utils'

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

    expect(await hasRedbox(browser)).toBe(true)

    await next.patchFile('app/comp.server.js', clientComponentSource)

    expect(await hasRedbox(browser)).toBe(false)
  })

  it('should recover from build errors when client component error', async () => {
    const browser = await next.browser('/')
    const clientComponentSource = await next.readFile('app/comp.client.js')

    await next.patchFile('app/comp.client.js', (content) => {
      return content.replace('{/* < */}', '<') // uncomment
    })

    expect(await hasRedbox(browser)).toBe(true)

    await next.patchFile('app/comp.client.js', clientComponentSource)

    expect(await hasRedbox(browser)).toBe(false)
  })
})
