/* eslint-env jest */
import { createOnHeadersCallback } from 'next/dist/server/app-render/stream-ops.node'
import { ServerResponse } from 'http'
import { NodeNextResponse } from 'next/dist/server/base-http/node'

describe('metadata.headers recording during prerender', () => {
  it('records headers even when response is already finished (e.g. background ISR revalidation)', () => {
    // Simulate a Node.js ServerResponse that has already finished sending headers
    const rawRes = new ServerResponse({} as any)
    Object.defineProperty(rawRes, 'headersSent', { value: true })
    Object.defineProperty(rawRes, 'writableEnded', { value: true })
    const res = new NodeNextResponse(rawRes)

    const metadata: { headers?: Record<string, string | string[]> } = {}

    const appendHeader = (name: string, value: string | string[]) => {
      try {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            res.appendHeader(name, item)
          })
        } else {
          res.appendHeader(name, value)
        }
      } catch {}
      metadata.headers ??= {}
      const existing = metadata.headers[name]
      const valuesToAdd = Array.isArray(value) ? value : [value]
      if (existing !== undefined) {
        const existingArray = (
          Array.isArray(existing) ? existing : [existing]
        ).map(String)
        const newValues = valuesToAdd.filter((v) => !existingArray.includes(v))
        if (newValues.length > 0) {
          metadata.headers[name] = [...existingArray, ...newValues]
        }
      } else {
        metadata.headers[name] = value
      }
    }

    const onHeaders = createOnHeadersCallback(appendHeader)

    const headers1 = new Headers()
    headers1.append(
      'link',
      '</_next/static/media/font.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2"'
    )
    onHeaders(headers1)

    const headers2 = new Headers()
    headers2.append(
      'link',
      '</_next/static/css/styles.css>; rel=preload; as="style"'
    )
    onHeaders(headers2)

    expect(metadata.headers).toBeDefined()
    expect(metadata.headers?.link).toEqual([
      '</_next/static/media/font.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2"',
      '</_next/static/css/styles.css>; rel=preload; as="style"',
    ])
  })
})
