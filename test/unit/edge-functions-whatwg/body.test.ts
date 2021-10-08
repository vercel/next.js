/* eslint-env jest */

import {
  Blob,
  File,
  FormData,
} from 'next/dist/compiled/@javivelasco/formdata-node'
import { Body } from 'next/dist/server/edge-functions-whatwg/body'
import { Crypto } from 'next/dist/server/edge-functions-whatwg/polyfills'
import { Headers } from 'next/dist/server/edge-functions-whatwg/headers'
import { streamToIterator } from 'next/dist/server/edge-functions-whatwg/utils'
import * as streams from 'web-streams-polyfill/ponyfill'

class Implementation extends Body {
  headers: Headers
  constructor(init: BodyInit) {
    super(init)
    this.headers = new Headers()
  }
}

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

it('flags the body as used after reading it', async () => {
  const { readable, writable } = new TransformStream()
  const encoder = new TextEncoder()
  const writer = writable.getWriter()
  writer.write(encoder.encode(''))
  writer.close()

  const body = new Implementation(readable)
  expect(body.bodyUsed).toEqual(false)

  const reader = body.body.getReader()
  expect(body.bodyUsed).toEqual(false)

  while (true) {
    const { done } = await reader.read()
    if (done) break
  }

  reader.releaseLock()
  expect(body.bodyUsed).toEqual(true)
})

it('throws when the body was directly consumed', async () => {
  global['crypto'].getRandomValues = (array: number[]) => array
  const object = { hello: 'world' }
  const blob = new Blob([JSON.stringify(object, null, 2)], {
    type: 'application/json',
  })

  const formData = new FormData()
  formData.append('name', 'John')
  formData.append('lastname', 'Doe')
  formData.append('metadata', blob)

  const body = new Implementation(formData)

  // Read the body through the stream
  for await (const item of streamToIterator(body.body)) {
    expect(item).toBeTruthy()
  }

  // It allows to access again the already read stream
  const reader = body.body.getReader()
  const { done } = await reader.read()
  expect(done).toBeTruthy()

  const error = await body.text().catch((err) => err)
  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toEqual(
    'Body has already been used. It can only be used once. Use tee() first if you need to read it twice.'
  )
})

it('throws when the body was indirectly consumed', async () => {
  global['crypto'].getRandomValues = (array: number[]) => array
  const object = { hello: 'world' }
  const blob = new Blob([JSON.stringify(object, null, 2)], {
    type: 'application/json',
  })

  const formData = new FormData()
  formData.append('name', 'John')
  formData.append('lastname', 'Doe')
  formData.append('metadata', blob)

  const body = new Implementation(formData)
  const text = await body.text()
  expect(text).toBeTruthy()

  const error = await body.text().catch((err) => err)
  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toEqual(
    'Body has already been used. It can only be used once. Use tee() first if you need to read it twice.'
  )
})

it('allows to read a FormData body as text', async () => {
  global['crypto'].getRandomValues = (array: number[]) => array
  const object = { hello: 'world' }
  const blob = new Blob([JSON.stringify(object, null, 2)], {
    type: 'application/json',
  })

  const formData = new FormData()
  formData.append('name', 'John')
  formData.append('lastname', 'Doe')
  formData.append('metadata', blob)

  const body = new Implementation(formData)
  const text = await body.text()
  expect(text).toMatchInlineSnapshot(`
"--0000000000000000000000000000000000000000000000000000000000000000
Content-Disposition: form-data; name=\\"name\\"

John
--0000000000000000000000000000000000000000000000000000000000000000
Content-Disposition: form-data; name=\\"lastname\\"

Doe
--0000000000000000000000000000000000000000000000000000000000000000
Content-Disposition: form-data; name=\\"metadata\\"; filename=\\"blob\\"
Content-Type: application/json

{
  \\"hello\\": \\"world\\"
}
--0000000000000000000000000000000000000000000000000000000000000000--

"
`)
})

it('allows to read a null body as ArrayBuffer', async () => {
  const body = new Implementation(null)
  const value = await body.arrayBuffer()
  expect(new Uint8Array(value)).toHaveLength(0)
})

it('allows to read a text body as ArrayBuffer', async () => {
  const body = new Implementation('Hello world')
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  const value = await body.arrayBuffer()
  const decoded = dec.decode(value)
  expect(decoded).toEqual('Hello world')
  expect(value).toEqual(enc.encode('Hello world').buffer)
})

it('allows to read a chunked body as ArrayBuffer', async () => {
  const { readable, writable } = new TransformStream()
  const encoder = new TextEncoder()
  const writer = writable.getWriter()
  writer.write(encoder.encode('Hello '))
  writer.write(encoder.encode('world!'))
  writer.close()

  const body = new Implementation(readable)
  const value = await body.arrayBuffer()
  const decoder = new TextDecoder()
  const decoded = decoder.decode(value)
  expect(decoded).toEqual('Hello world!')
  expect(value).toEqual(encoder.encode('Hello world!').buffer)
})

it('allows to read a URLSearchParams body as FormData', async () => {
  const params = new URLSearchParams('q=URLUtils.searchParams&topic=api')
  const body = new Implementation(params)
  const formData = await body.formData()
  expect(formData.get('topic')).toEqual('api')
})

it('allows to read a Blob body as Blob', async () => {
  const object = { hello: 'world' }
  const str = JSON.stringify(object, null, 2)
  const body = new Implementation(new Blob([str]))
  const blob = await body.blob()
  const txt = await blob.text()
  expect(txt).toEqual(str)
})

it('allows to read a text body as JSON', async () => {
  const body = new Implementation(JSON.stringify({ message: 'hi', value: 10 }))
  const value = await body.json()
  expect(value).toEqual({ message: 'hi', value: 10 })
})

it('throws when reading a text body as JSON but it is invalid', async () => {
  const body = new Implementation('{ hi: "there", ')
  const error = await body.json().catch((err) => err)
  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toEqual(
    'invalid json body reason: Unexpected token h in JSON at position 2'
  )
})
