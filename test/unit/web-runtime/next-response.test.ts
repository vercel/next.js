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

it('automatically parses and formats JSON', async () => {
  const { NextResponse } = await import(
    'next/dist/server/web/spec-extension/response'
  )
  const response = new NextResponse({ message: 'hello!' })
  expect(response.headers.get('content-type')).toEqual('application/json')
  expect(await response.json()).toEqual({ message: 'hello!' })
})
