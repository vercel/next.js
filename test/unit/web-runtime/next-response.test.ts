/* eslint-env jest */

import { Blob, File, FormData } from 'next/dist/compiled/formdata-node'
import { Crypto } from 'next/dist/server/web/sandbox/polyfills'
import { Response } from 'next/dist/server/web/spec-compliant/response'
import { Headers } from 'next/dist/server/web/spec-compliant/headers'
import * as streams from 'web-streams-polyfill/ponyfill'

beforeAll(() => {
  global['Blob'] = Blob
  global['crypto'] = new Crypto()
  global['File'] = File
  global['FormData'] = FormData
  global['Headers'] = Headers
  global['ReadableStream'] = streams.ReadableStream
  global['TransformStream'] = streams.TransformStream
  global['Response'] = Response
})

afterAll(() => {
  delete global['Blob']
  delete global['crypto']
  delete global['File']
  delete global['Headers']
  delete global['FormData']
  delete global['ReadableStream']
  delete global['TransformStream']
})

const toJSON = async (response) => ({
  body: await response.json(),
  contentType: response.headers.get('content-type'),
  status: response.status,
})

it('automatically parses and formats JSON', async () => {
  const { NextResponse } = await import(
    'next/dist/server/web/spec-extension/response'
  )

  expect(await toJSON(NextResponse.json({ message: 'hello!' }))).toMatchObject({
    contentType: 'application/json',
    body: { message: 'hello!' },
  })

  expect(
    await toJSON(NextResponse.json({ status: 'success' }, { status: 201 }))
  ).toMatchObject({
    contentType: 'application/json',
    body: { status: 'success' },
    status: 201,
  })

  expect(
    await toJSON(
      NextResponse.json({ error: { code: 'bad_request' } }, { status: 400 })
    )
  ).toMatchObject({
    contentType: 'application/json',
    body: { error: { code: 'bad_request' } },
    status: 400,
  })

  expect(await toJSON(NextResponse.json(null))).toMatchObject({
    contentType: 'application/json',
    body: null,
  })

  expect(await toJSON(NextResponse.json(''))).toMatchObject({
    contentType: 'application/json',
    body: '',
  })
})

it('response.cookie does not modify options', async () => {
  const { NextResponse } = await import(
    'next/dist/server/web/spec-extension/response'
  )

  const options = { maxAge: 10000 }
  const response = NextResponse.json(null)
  response.cookie('cookieName', 'cookieValue', options)
  expect(options).toEqual({ maxAge: 10000 })
})
