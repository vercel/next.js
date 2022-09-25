import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import path from 'path'

describe('API Endpoints can return a Response object', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, '../app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('returns a non-streaming response', async () => {
    const response = await fetchViaHTTP(next.url, '/api/test')
    expect({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      text: await response.text(),
    }).toEqual({
      status: 201,
      headers: expect.objectContaining({
        'x-incoming-url': '/api/test',
        'x-from-node-api': '1',
        'x-will-be-merged': '1',
      }),
      text: 'from Response',
    })
  })

  it('returns a Node.js-api streaming response', async () => {
    const response = await fetchViaHTTP(next.url, '/api/node-streams')
    expect({
      status: response.status,
      headers: Object.fromEntries(response.headers),
    }).toEqual({
      status: 201,
      headers: expect.objectContaining({
        'x-incoming-url': '/api/node-streams',
        'x-from-node-api': '1',
        'x-will-be-merged': '1',
      }),
    })

    const chunks: string[] = []
    // @ts-ignore
    for await (const chunk of response.body) {
      chunks.push(chunk.toString())
    }

    expect(chunks).toEqual(['hello\n', 'world\n'])
  })

  it('returns a web-api streaming response', async () => {
    const response = await fetchViaHTTP(next.url, '/api/web-streams')
    expect({
      status: response.status,
      headers: Object.fromEntries(response.headers),
    }).toEqual({
      status: 201,
      headers: expect.objectContaining({
        'x-incoming-url': '/api/node-streams',
        'x-from-node-api': '1',
        'x-will-be-merged': '1',
      }),
    })

    const chunks: string[] = []
    // @ts-ignore
    for await (const chunk of response.body) {
      chunks.push(chunk.toString())
    }

    expect(chunks).toEqual(['hello\n', 'world\n'])
  })
})
