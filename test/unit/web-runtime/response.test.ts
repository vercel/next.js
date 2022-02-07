/* eslint-env jest */

import { Blob, File, FormData } from 'next/dist/compiled/formdata-node'
import { Response } from 'next/dist/server/web/spec-compliant/response'
import { Crypto } from 'next/dist/server/web/sandbox/polyfills'
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

it('clones responses', async () => {
  const { readable, writable } = new TransformStream()
  const encoder = new TextEncoder()
  const writer = writable.getWriter()
  writer.write(encoder.encode('Hello '))
  writer.write(encoder.encode('world!'))
  writer.close()

  const res1 = new Response(readable)
  const res2 = res1.clone()

  expect(await res1.text()).toEqual('Hello world!')
  expect(await res2.text()).toEqual('Hello world!')
})
