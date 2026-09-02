import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Turbopack Emotion transform with SWC plugins', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@emotion/react': '11.14.0',
      '@emotion/styled': '11.14.1',
      '@swc/plugin-react-remove-properties': '11.1.0',
    },
  })

  it('uses the same Emotion target class during SSR and hydration', async () => {
    const $ = await next.render$('/')
    const serverTarget = $('#styled-button').attr('data-server-target')
    expect(serverTarget).toBeTruthy()

    const browser = await next.browser('/')
    const button = browser.elementByCss('#styled-button')
    const clientTarget = await retry(async () => {
      const target = await button.getAttribute('data-client-target')
      expect(target).toBeTruthy()
      return target
    })

    expect(await button.getAttribute('data-custom-attribute')).toBeNull()
    expect(clientTarget).toBe(serverTarget)
  })
})
