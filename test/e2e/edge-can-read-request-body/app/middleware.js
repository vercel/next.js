// @ts-check

import { NextResponse } from 'next/server'

/**
 * @param {NextRequest} req
 */
export default async function middleware(req) {
  const res = NextResponse.next()
  res.headers.set('x-incoming-content-type', req.headers.get('content-type'))

  const handler =
    bodyHandlers[req.nextUrl.searchParams.get('middleware-handler')]
  const headers = await handler?.(req)
  for (const [key, value] of headers ?? []) {
    res.headers.set(key, value)
  }

  return res
}

/**
 * @typedef {import('next/server').NextRequest} NextRequest
 * @typedef {(req: NextRequest) => Promise<[string, string][]>} Handler
 * @type {Record<string, Handler>}
 */
const bodyHandlers = {
  json: async (req) => {
    const json = await req.json()
    return [
      ['x-req-type', 'json'],
      ['x-serialized', JSON.stringify(json)],
    ]
  },
  text: async (req) => {
    const text = await req.text()
    return [
      ['x-req-type', 'text'],
      ['x-serialized', text],
    ]
  },
  formData: async (req) => {
    const formData = await req.formData()
    return [
      ['x-req-type', 'formData'],
      ['x-serialized', JSON.stringify(Object.fromEntries(formData))],
    ]
  },
}
