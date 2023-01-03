import { createNext } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('pause-hydration', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import { useEffect, useState } from 'react'
          
          export default function Page() { 
            const [ready, setReady] = useState(false)

            useEffect(() => { setReady(true) }, [])

            if (ready) return <p>after effect</p>

            return <p>server string</p>
          } 
        `,
      },
      dependencies: {},
    })
  })

  afterAll(() => next.destroy())

  it('should not modify the initial HTML ', async () => {
    const html = await renderViaHTTP(next.url, '/?pause_hydration')
    expect(html).toContain('server string')
    expect(html).not.toContain('Hydrate')
  })

  it('should pause-hydration until interaction', async () => {
    const browser = await webdriver(next.appPort, '/?pause_hydration', {
      waitHydration: true,
    })

    expect(await browser.elementById('__next-pause-hydration').text()).toBe(
      'Hydrate'
    )

    expect(await browser.elementByCss('p').text()).toBe('server string')

    browser.elementById('__next-pause-hydration').click()

    expect(await browser.elementByCss('p').text()).toBe('after effect')
  })
})
