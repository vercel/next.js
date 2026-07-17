import { once } from 'node:events'
import http from 'node:http'
import { nextTestSetup } from 'e2e-utils'

function getRawHeaderValues(rawHeaders: string[], name: string) {
  const values: string[] = []

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index].toLowerCase() === name.toLowerCase()) {
      values.push(rawHeaders[index + 1])
    }
  }

  return values
}

describe('cached redirect headers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not duplicate cached redirect headers', async () => {
    const response = await new Promise<http.IncomingMessage>(
      (resolve, reject) => {
        http.get(new URL('/test', next.url), resolve).on('error', reject)
      }
    )

    response.resume()
    await once(response, 'end')

    expect(response.statusCode).toBe(308)
    expect(getRawHeaderValues(response.rawHeaders, 'location')).toEqual([
      '/destination',
    ])
    expect(
      getRawHeaderValues(response.rawHeaders, 'x-nextjs-stale-time')
    ).toHaveLength(1)
  })
})
