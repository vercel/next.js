/* eslint-env jest */
import path from 'path'
import { nextTestSetup, FileRef } from 'e2e-utils'

describe('app dir - with proxy in src dir', () => {
  const { next } = nextTestSetup({
    files: {
      'src/app': new FileRef(path.join(__dirname, 'app')),
      'next.config.js': new FileRef(path.join(__dirname, 'next.config.js')),
      'src/proxy.js': `
      import { NextResponse } from 'next/server'
      import { cookies } from 'next/headers'

      export async function proxy(request) {
        const cookie = (await cookies()).get('test-cookie')
        return NextResponse.json({ cookie })
      }
    `,
    },
  })

  it('works without crashing when using RequestStore', async () => {
    const browser = await next.browser('/')
    await browser.addCookie({
      name: 'test-cookie',
      value: 'test-cookie-response',
    })
    await browser.refresh()

    const html = await browser.eval('document.documentElement.innerHTML')

    expect(html).toContain('test-cookie-response')
  })
})
