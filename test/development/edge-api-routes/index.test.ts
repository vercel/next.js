import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

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
    let response = await renderViaHTTP(next.url, '/api/hello')
    expect(response).toBe('edge response')

    // Server
    await next.patchFile(
      'pages/api/hello.js',
      `
      export default function (req, res) {
        res.send('server response')
      }
      `
    )
    response = await renderViaHTTP(next.url, '/api/hello')
    expect(response).toBe('server response')
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
    let response = await renderViaHTTP(next.url, '/api/hello2')
    expect(response).toBe('server response')

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
    response = await renderViaHTTP(next.url, '/api/hello2')
    expect(response).toBe('edge response')
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
    let response = await renderViaHTTP(next.url, '/api/hello3')
    expect(response).toBe('edge response')

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
    response = await renderViaHTTP(next.url, '/api/hello3')
    expect(response).toInclude('Unexpected token')

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
    response = await renderViaHTTP(next.url, '/api/hello3')
    expect(response).toBe('edge response 2')
  })

  test('Switch to new runtime and then back ', async () => {
    // Server
    await next.patchFile(
      'pages/api/hello4.js',
      `
      export default function (req, res) {
        res.send('server response')
      }
      `
    )
    let response = await renderViaHTTP(next.url, '/api/hello4')
    expect(response).toBe('server response')

    // Edge
    await next.patchFile(
      'pages/api/hello4.js',
      `
      export const config = {
        runtime: 'experimental-edge',
      }
      
      export default () => new Response('edge response')
      `
    )
    response = await renderViaHTTP(next.url, '/api/hello4')
    expect(response).toBe('edge response')

    // Server
    await next.patchFile(
      'pages/api/hello4.js',
      `
      export default function (req, res) {
        res.send('server response')
      }
      `
    )
    response = await renderViaHTTP(next.url, '/api/hello4')
    expect(response).toBe('server response')
  })
})
