import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import path from 'path'
import Primitives from '@edge-runtime/primitives'

const { FormData, fetch } = Primitives

describe('Edge can read request body', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.resolve(__dirname, './app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('renders the static page', async () => {
    const html = await renderViaHTTP(next.url, '/api/nothing')
    expect(html).toContain('ok')
  })

  describe('middleware', () => {
    it('reads a JSON body', async () => {
      const response = await fetch(
        `${next.url}/api/nothing?middleware-handler=json`,
        {
          method: 'POST',
          body: JSON.stringify({ hello: 'world' }),
        }
      )
      expect(await serialize(response)).toMatchObject({
        text: expect.stringContaining('ok'),
        status: 200,
        headers: {
          'x-req-type': 'json',
          'x-serialized': '{"hello":"world"}',
        },
      })
    })

    it('reads a text body', async () => {
      const response = await fetch(
        `${next.url}/api/nothing?middleware-handler=text`,
        {
          method: 'POST',
          body: JSON.stringify({ hello: 'world' }),
        }
      )
      expect(await serialize(response)).toMatchObject({
        text: expect.stringContaining('ok'),
        status: 200,
        headers: {
          'x-req-type': 'text',
          'x-serialized': '{"hello":"world"}',
        },
      })
    })

    it('reads an URL encoded form data', async () => {
      const response = await fetch(
        `${next.url}/api/nothing?middleware-handler=formData`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ hello: 'world' }).toString(),
        }
      )
      expect(await serialize(response)).toMatchObject({
        text: expect.stringContaining('ok'),
        status: 200,
        headers: {
          'x-req-type': 'formData',
          'x-serialized': '{"hello":"world"}',
        },
      })
    })

    /**
     * This test is skipped because `undici` does not implement
     * form-data body parsing right now.
     */
    it.skip('reads a multipart form data', async () => {
      const formData = new FormData()
      formData.set('hello', 'world')
      const response = await fetch(
        `${next.url}/api/nothing?middleware-handler=formData`,
        {
          method: 'POST',
          body: formData,
        }
      )
      expect(await serialize(response)).toMatchObject({
        text: expect.stringContaining('ok'),
        status: 200,
        headers: {
          'x-req-type': 'formData',
          'x-serialized': '{"hello":"world"}',
        },
      })
    })
  })
})

async function serialize(response: Response) {
  return {
    text: await response.text(),
    headers: Object.fromEntries(response.headers),
    status: response.status,
  }
}
