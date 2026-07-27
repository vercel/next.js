/* eslint-env jest */
import path from 'path'
import { nextTestSetup, FileRef } from 'e2e-utils'

describe('app dir - proxy without pages dir', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
      'next.config.js': new FileRef(path.join(__dirname, 'next.config.js')),
      'proxy.js': `
      import { NextResponse } from 'next/server'

      export async function proxy(request) {
        return new NextResponse('redirected')
      }

      export const config = {
        matcher: '/headers'
      }
    `,
    },
  })

  it('Updates headers', async () => {
    const html = await next.render('/headers')

    expect(html).toContain('redirected')
  })
})
