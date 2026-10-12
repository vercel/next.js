import http from 'http'
import type { ProxyFetchRequest, ProxyResponse } from '../proxy'
import type { NextWorkerFixture } from './next-worker-fixture'
import { applyNextWorkerFixture } from './next-worker-fixture'

// Mimics the request `fetch.ts` sends to the proxy from a Next.js server.
// `agent: false` closes each connection so the proxy server can shut down.
function sendProxyFetch(
  worker: NextWorkerFixture,
  testData: string
): Promise<ProxyResponse> {
  const body: ProxyFetchRequest = {
    api: 'fetch',
    testData,
    request: {
      url: 'https://example.com/',
      method: 'GET',
      headers: [],
      body: null,
    },
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port: worker.proxyPort, method: 'POST', path: '/', agent: false },
      async (res) => {
        let data = ''
        for await (const chunk of res) {
          data += chunk
        }
        resolve(JSON.parse(data))
      }
    )
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}

// Assertions run after the fixture is torn down, so a failure does not leave
// the proxy server listening and keep Jest from exiting.
async function proxyFetchWith(
  setup: (worker: NextWorkerFixture) => void,
  testData: string
): Promise<ProxyResponse> {
  let response: ProxyResponse | undefined
  await applyNextWorkerFixture(async (worker) => {
    setup(worker)
    response = await sendProxyFetch(worker, testData)
  })
  return response!
}

describe('NextWorkerFixture', () => {
  it('passes through fetches for a test id with no registered handler', async () => {
    expect(await proxyFetchWith(() => {}, 'unknown-test')).toEqual({
      api: 'continue',
    })
  })

  it('passes through fetches for a test that has been cleaned up', async () => {
    const response = await proxyFetchWith((worker) => {
      worker.onFetch('test-1', () => 'abort')
      worker.cleanupTest('test-1')
    }, 'test-1')

    expect(response).toEqual({ api: 'continue' })
  })

  it('still reports fetches its handler does not mock as unhandled', async () => {
    const response = await proxyFetchWith((worker) => {
      worker.onFetch('test-1', () => undefined)
    }, 'test-1')

    expect(response).toEqual({ api: 'unhandled' })
  })

  it('returns the response from the registered handler', async () => {
    const response = await proxyFetchWith((worker) => {
      worker.onFetch('test-1', () => new Response('mocked'))
    }, 'test-1')

    expect(response).toMatchObject({
      api: 'fetch',
      response: { status: 200, body: Buffer.from('mocked').toString('base64') },
    })
  })
})
