import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, renderViaHTTP } from 'next-test-utils'

describe('edge-api-routes', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  test('Switch between runtimes - edge first', async () => {
    // Edge
    await next.patchFile(
      'pages/api/hello.js',
      `
      export const config = {
        runtime: 'experimental-edge',
      }
      
      export default () => new Response('edge response')
      `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello'), 'edge response')

    // Server
    await next.patchFile(
      'pages/api/hello.js',
      `
      export default function (req, res) {
        res.send('server response')
      }
      `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello'), 'server response')

    // Edge
    await next.patchFile(
      'pages/api/hello.js',
      `
        export const config = {
          runtime: 'experimental-edge',
        }
        
        export default () => new Response('edge response')
        `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello'), 'edge response')
  })

  test('Switch between runtimes - server first', async () => {
    // Server
    await next.patchFile(
      'pages/api/hello2.js',
      `
      export default function (req, res) {
        res.send('server response')
      }
      `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello2'), 'server response')

    // Edge
    await next.patchFile(
      'pages/api/hello2.js',
      `
      export const config = {
        runtime: 'experimental-edge',
      }
      
      export default () => new Response('edge response')
      `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello2'), 'edge response')

    // Server
    await next.patchFile(
      'pages/api/hello2.js',
      `
        export default function (req, res) {
          res.send('server response')
        }
        `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello2'), 'server response')
  })

  test('Recover from syntax error', async () => {
    await next.patchFile(
      'pages/api/hello3.js',
      `
    export const config = {
      runtime: 'experimental-edge',
    }

    export default () => new Response('edge response')
    `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello3'), 'edge response')

    // Syntax error
    await next.patchFile(
      'pages/api/hello3.js',
      `
    export const config = {
      runtime: 'experimental-edge',
    }

    export default  => new Response('edge response')
    `
    )
    await check(
      () => renderViaHTTP(next.url, '/api/hello3'),
      /Unexpected token/
    )

    // Fix syntax error
    await next.patchFile(
      'pages/api/hello3.js',
      `
    export const config = {
      runtime: 'experimental-edge',
    }

    export default () => new Response('edge response 2')
    `
    )
    await check(() => renderViaHTTP(next.url, '/api/hello3'), 'edge response 2')
  })
})
