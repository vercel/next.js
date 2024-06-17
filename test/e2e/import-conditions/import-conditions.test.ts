import { nextTestSetup } from 'e2e-utils'

describe('react version', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'library-with-exports': 'link:./library-with-exports',
    },
  })

  it('Pages Router page headers with edge runtime', async () => {
    const response = await next.fetch('/pages/edge-page')

    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    expect(middlewareHeaders).toEqual({
      react: 'react-server',
      serverFavoringBrowser: 'worker',
      serverFavoringEdge: 'worker',
    })
  })

  it('Pages Router page with edge runtime', async () => {
    const browser = await next.browser('/pages/edge-page')

    const json = await browser.elementByCss('output').text()
    expect(JSON.parse(json)).toEqual({
      server: {
        react: 'default',
        serverFavoringBrowser: 'worker',
        serverFavoringEdge: 'worker',
      },
      client: {
        react: 'default',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'browser',
      },
    })
  })

  it('Pages Router page headers with nodejs runtime', async () => {
    const response = await next.fetch('/pages/node-page')

    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    expect(middlewareHeaders).toEqual({
      react: 'react-server',
      serverFavoringBrowser: 'worker',
      serverFavoringEdge: 'worker',
    })
  })

  it('Pages Router page with nodejs runtime after hydration', async () => {
    const browser = await next.browser('/pages/node-page')

    const json = await browser.elementByCss('output').text()
    expect(JSON.parse(json)).toEqual({
      server: {
        react: 'default',
        serverFavoringBrowser: 'node',
        serverFavoringEdge: 'node',
      },
      client: {
        react: 'default',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'browser',
      },
    })
  })

  it('App Router page headers with edge runtime', async () => {
    const response = await next.fetch('/app/edge-page')

    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    expect(middlewareHeaders).toEqual({
      react: 'react-server',
      serverFavoringBrowser: 'worker',
      serverFavoringEdge: 'worker',
    })
  })

  it('App Router page with edge runtime', async () => {
    const browser = await next.browser('/app/edge-page')

    await browser.waitForElementByCss('input[type="submit"]').click()
    await browser.waitForElementByCss('output[aria-busy="false"]')

    const json = await browser.elementByCss('output').text()
    expect(JSON.parse(json)).toEqual({
      server: {
        react: 'react-server',
        serverFavoringBrowser: 'worker',
        serverFavoringEdge: 'worker',
      },
      client: {
        react: 'default',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'browser',
      },
      action: {
        react: 'react-server',
        serverFavoringBrowser: 'worker',
        serverFavoringEdge: 'worker',
      },
    })
  })

  it('App Router page headers with nodejs runtime', async () => {
    const response = await next.fetch('/app/node-page')

    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    expect(middlewareHeaders).toEqual({
      react: 'react-server',
      serverFavoringBrowser: 'worker',
      serverFavoringEdge: 'worker',
    })
  })

  it('App Router page with nodejs runtime', async () => {
    const browser = await next.browser('/app/node-page')

    await browser.waitForElementByCss('input[type="submit"]').click()
    await browser.waitForElementByCss('output[aria-busy="false"]')

    const json = await browser.elementByCss('output').text()
    expect(JSON.parse(json)).toEqual({
      server: {
        react: 'react-server',
        serverFavoringBrowser: 'node',
        serverFavoringEdge: 'node',
      },
      client: {
        react: 'default',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'browser',
      },
      action: {
        react: 'react-server',
        serverFavoringBrowser: 'node',
        serverFavoringEdge: 'node',
      },
    })
  })

  it('App Router Route Handler with nodejs runtime', async () => {
    const response = await next.fetch('/node-route')

    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    const data = await response.json()
    expect({ middlewareHeaders, data }).toEqual({
      middlewareHeaders: {
        react: 'react-server',
        serverFavoringBrowser: 'worker',
        serverFavoringEdge: 'worker',
      },
      data: {
        react: 'react-server',
        serverFavoringBrowser: 'node',
        serverFavoringEdge: 'node',
      },
    })
  })

  it('App Router Route Handler with edge runtime', async () => {
    const response = await next.fetch('/edge-route')

    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    const data = await response.json()
    expect({ middlewareHeaders, data }).toEqual({
      middlewareHeaders: {
        react: 'react-server',
        serverFavoringBrowser: 'worker',
        serverFavoringEdge: 'worker',
      },
      data: {
        react: 'react-server',
        serverFavoringBrowser: 'worker',
        serverFavoringEdge: 'worker',
      },
    })
  })
})
