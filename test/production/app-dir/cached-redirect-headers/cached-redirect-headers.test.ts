import { once } from 'node:events'
import http from 'node:http'
import { nextTestSetup } from 'e2e-utils'

const destination = '/destination'

function getRawHeaderValues(rawHeaders: string[], name: string) {
  const values: string[] = []

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index].toLowerCase() === name.toLowerCase()) {
      values.push(rawHeaders[index + 1])
    }
  }

  return values
}

async function getRawResponse(url: URL): Promise<http.IncomingMessage> {
  const response = await new Promise<http.IncomingMessage>(
    (resolve, reject) => {
      http.get(url, resolve).on('error', reject)
    }
  )

  response.resume()
  await once(response, 'end')
  return response
}

function expectSingleRedirect(
  response: http.IncomingMessage,
  statusCode: 307 | 308
) {
  expect(response.statusCode).toBe(statusCode)
  expect(getRawHeaderValues(response.rawHeaders, 'location')).toEqual([
    destination,
  ])
  expect(
    getRawHeaderValues(response.rawHeaders, 'x-nextjs-stale-time')
  ).toHaveLength(1)
}

describe('cached redirect headers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    { pathname: '/permanent', statusCode: 308 as const },
    { pathname: '/temporary', statusCode: 307 as const },
  ])(
    'does not duplicate force-static $statusCode redirect headers',
    async ({ pathname, statusCode }) => {
      const response = await getRawResponse(new URL(pathname, next.url))

      expectSingleRedirect(response, statusCode)
    }
  )

  it('does not duplicate ISR fallback redirect headers', async () => {
    const url = new URL('/isr/fallback', next.url)

    expectSingleRedirect(await getRawResponse(url), 308)
    expectSingleRedirect(await getRawResponse(url), 308)

    await new Promise((resolve) => setTimeout(resolve, 1_100))

    expectSingleRedirect(await getRawResponse(url), 308)
  })
})
