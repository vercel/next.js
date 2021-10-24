/* eslint-env jest */

import { Blob, File, FormData } from 'next/dist/compiled/formdata-node'
import { Crypto } from 'next/dist/server/web/sandbox/polyfills'
import { Headers } from 'next/dist/server/web/spec-compliant/headers'
import { Request } from 'next/dist/server/web/spec-compliant/request'
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

it('parses and reconstructs the URL alone', async () => {
  const url = 'https://vercel.com/foo/bar?one=value'
  const req = new Request(url)
  expect(req.url).toEqual(url)
})

it('throws when the URL is malformed', async () => {
  expect(() => new Request('meeeh')).toThrowError('Invalid URL')
})
