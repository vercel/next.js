import type { TestInfo } from '@playwright/test'
import type { FetchHandler } from './next-worker-fixture'
import { step } from './step'

async function parseBody(
  r: Pick<Request, 'headers' | 'json' | 'text' | 'arrayBuffer' | 'formData'>
): Promise<Record<string, string>> {
  const contentType = r.headers.get('content-type')
  let error: string | undefined
  let text: string | undefined
  let json: unknown
  let formData: FormData | undefined
  let buffer: ArrayBuffer | undefined
  if (contentType?.includes('text')) {
    try {
      text = await r.text()
    } catch (e) {
      error = 'failed to parse text'
    }
  } else if (contentType?.includes('json')) {
    try {
      json = await r.json()
    } catch (e) {
      error = 'failed to parse json'
    }
  } else if (contentType?.includes('form-data')) {
    try {
      formData = await r.formData()
    } catch (e) {
      error = 'failed to parse formData'
    }
  } else {
    try {
      buffer = await r.arrayBuffer()
    } catch (e) {
      error = 'failed to parse arrayBuffer'
    }
  }
  return {
    ...(error ? { error } : null),
    ...(text ? { text } : null),
    ...(json ? { json: JSON.stringify(json) } : null),
    ...(formData ? { formData: JSON.stringify(Array.from(formData)) } : null),
    ...(buffer && buffer.byteLength > 0
      ? { buffer: `base64;${Buffer.from(buffer).toString('base64')}` }
      : null),
  }
}

function parseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    Array.from(headers)
      .sort(([key1], [key2]) => key1.localeCompare(key2))
      .map(([key, value]) => {
        return [`header.${key}`, value]
      })
  )
}

export async function reportFetch(
  testInfo: TestInfo,
  req: Request,
  handler: FetchHandler
): Promise<Awaited<ReturnType<FetchHandler>>> {
  return step(
    testInfo,
    {
      title: `next.onFetch: ${req.method} ${req.url}`,
      category: 'next.onFetch',
      apiName: 'next.onFetch',
      params: {
        method: req.method,
        url: req.url,
        ...(await parseBody(req.clone())),
        ...parseHeaders(req.headers),
      },
    },
    async (complete) => {
      const res = await handler(req)
      if (res === undefined || res == null) {
        complete({ error: { message: 'unhandled' } })
      } else if (typeof res === 'string' && res !== 'continue') {
        complete({ error: { message: res } })
      } else {
        let body: Record<string, unknown>
        if (typeof res === 'string') {
          body = { response: res }
        } else {
          const { status, statusText } = res
          body = {
            status,
            ...(statusText ? { statusText } : null),
            ...(await parseBody(res.clone())),
            ...parseHeaders(res.headers),
          }
        }
        await step(
          testInfo,
          {
            title: `next.onFetch.fulfilled: ${req.method} ${req.url}`,
            category: 'next.onFetch',
            apiName: 'next.onFetch.fulfilled',
            params: {
              ...body,
              'request.url': req.url,
              'request.method': req.method,
            },
          },
          async () => undefined
        ).catch(() => undefined)
      }
      return res
    }
  )
}
