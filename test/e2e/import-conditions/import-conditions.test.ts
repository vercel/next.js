import { nextTestSetup } from 'e2e-utils'

describe('react version', () => {
  const dependencies = (global as any).isNextDeploy
    ? // `link` is incompatible with the npm version used when this test is deployed
      {
        'library-with-exports': 'file:./library-with-exports',
      }
    : {
        'library-with-exports': 'link:./library-with-exports',
      }

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies,
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
      serverFavoringBrowser: 'browser',
      serverFavoringEdge: 'edge-light',
    })
  })

  it('Pages Router page with edge runtime', async () => {
    const browser = await next.browser('/pages/edge-page')

    const json = await browser.elementByCss('output').text()
    expect(JSON.parse(json)).toEqual({
      server: {
        react: 'default',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
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
      serverFavoringBrowser: 'browser',
      serverFavoringEdge: 'edge-light',
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

  it('Pages Router API route with nodejs runtime', async () => {
    const response = await next.fetch('/api/node-route')
    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    const apiConditions = await response.json()
    expect({ apiConditions, middlewareHeaders }).toEqual({
      apiConditions: {
        react: 'default',
        serverFavoringBrowser: 'node',
        serverFavoringEdge: 'node',
      },
      middlewareHeaders: {
        react: 'react-server',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
      },
    })
  })

  it('Pages Router API route with edge runtime', async () => {
    const response = await next.fetch('/api/edge-route')
    const middlewareHeaders = {
      react: response.headers.get('x-react-condition'),
      serverFavoringBrowser: response.headers.get(
        'x-server-favoring-browser-condition'
      ),
      serverFavoringEdge: response.headers.get(
        'x-server-favoring-edge-condition'
      ),
    }
    const apiConditions = await response.json()
    expect({ apiConditions, middlewareHeaders }).toEqual({
      apiConditions: {
        react: 'default',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
      },
      middlewareHeaders: {
        react: 'react-server',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
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
      serverFavoringBrowser: 'browser',
      serverFavoringEdge: 'edge-light',
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
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
      },
      client: {
        react: 'default',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'browser',
      },
      action: {
        react: 'react-server',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
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
      serverFavoringBrowser: 'browser',
      serverFavoringEdge: 'edge-light',
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
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
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
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
      },
      data: {
        react: 'react-server',
        serverFavoringBrowser: 'browser',
        serverFavoringEdge: 'edge-light',
      },
    })
  })
})
