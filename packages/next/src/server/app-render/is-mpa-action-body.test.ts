import { Readable } from 'node:stream'
import { isMPAactionRequest } from './is-mpa-action-body'
import type { IncomingMessage} from 'node:http';
import type { IncomingHttpHeaders } from 'node:http'
import { NodeNextRequest } from '../base-http/node'

function nodeStreamToNodeNextRequest(
  stream: Readable,
  headers: IncomingHttpHeaders
) {
  const rawRequest = stream as IncomingMessage
  rawRequest.url = 'http://__n'
  rawRequest.method = 'POST'
  rawRequest.headers = headers
  return new NodeNextRequest(rawRequest)
}

function formDataToNodeStream(formData: FormData) {
  const request = new Request('http://__n', {
    method: 'POST',
    body: formData,
  })
  const stream = Readable.fromWeb(
    request.body! as import('node:stream/web').ReadableStream<any>
  )
  return {
    stream,
    headers: Object.fromEntries(request.headers) as IncomingHttpHeaders,
  }
}

function nodeStreamToFormData(stream: Readable, headers: HeadersInit) {
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>
  const request = new Request('http://__n', {
    method: 'POST',
    headers,
    body: webStream,
    // @ts-expect-error: required for using a stream as a body, but not present in type definitions
    duplex: 'half',
  })
  return request.formData()
}

function createFormData(entries: [name: string, value: string][]) {
  const formData = new FormData()
  for (const [name, value] of entries) {
    formData.append(name, value)
  }
  return formData
}

function fakeActionFormDataWithoutBound(id: string) {
  return createFormData([
    [`$ACTION_ID_${id}`, ''],
    ['$ACTION_KEY', 'k0000000000'],
    ['foo', 'bar'],
  ])
}

function fakeActionFormDataWithBound(id: string, ref: string) {
  return createFormData([
    [`$ACTION_REF_${ref}`, ''],
    [`$ACTION_${ref}:0`, `{"id":"${id}","bound":"$@1"}`],
    [`$ACTION_${ref}:1`, '["$undefined"]'],
    ['$ACTION_KEY', 'k0000000000'],
    ['foo', 'bar'],
  ])
}

it.each([
  {
    description: 'without bound arguments (short)',
    value: fakeActionFormDataWithoutBound('0'),
  },
  {
    description: 'without bound arguments (long)',
    value: fakeActionFormDataWithoutBound(
      '40fb229134b5920f36ce70cc9f75b135d19f0dac36'
    ),
  },
  {
    description: 'with bound arguments (0)',
    value: fakeActionFormDataWithBound('01234567890abcdef', '0'),
  },
  {
    description: 'with bound arguments (1)',
    value: fakeActionFormDataWithBound(
      '40fb229134b5920f36ce70cc9f75b135d19f0dac36',
      '1'
    ),
  },
  {
    description: 'without bound arguments or any other fields',
    value: createFormData([['$ACTION_ID_0', '']]),
  },
])('matches: $description', async ({ value: formData }) => {
  const { stream, headers } = formDataToNodeStream(formData)
  const nextRequest = nodeStreamToNodeNextRequest(stream, headers)

  const [result, freshBody] = await isMPAactionRequest(nextRequest)

  expect(result).toBe(true)
  expect(freshBody).not.toBe(null)

  // the new body should still be deserializable to its original value
  const newFormData = await nodeStreamToFormData(
    freshBody!,
    headers as HeadersInit
  )
  expect([...formData.entries()]).toEqual([...newFormData.entries()])
})

it.each([
  {
    description: 'no special react headers',
    value: createFormData([
      ['foo', '3'],
      ['bar', '5'],
    ]),
  },
  // similar names
  {
    description: 'similar field name 1',
    value: createFormData([
      ['$ACTION', ''],
      ['foo', 'bar'],
    ]),
  },
  {
    description: 'similar field name 2',
    value: createFormData([
      ['$ACTION_REF_', ''],
      ['foo', 'bar'],
    ]),
  },
  {
    description: 'similar field name 3',
    value: createFormData([
      ['$ACTION_ID_', ''],
      ['foo', 'bar'],
    ]),
  },
  // correct name, wrong (non-empty) value
  {
    description: 'correct name, wrong (non-empty) value 1',
    value: createFormData([
      ['$ACTION_REF_0', 'xxx'],
      ['foo', 'bar'],
    ]),
  },
  {
    description: 'correct name, wrong (non-empty) value 2',
    value: createFormData([
      ['$ACTION_REF_1', 'xxx'],
      ['foo', 'bar'],
    ]),
  },
  {
    description: 'correct name, wrong (non-empty) value 3',
    value: createFormData([
      ['$ACTION_ID_01234567890abcdef', 'xxx'],
      ['foo', 'bar'],
    ]),
  },
  {
    description: 'correct name, wrong (non-empty) value',
    value: createFormData([
      ['$ACTION_ID_0', 'xxx'],
      ['foo', 'bar'],
    ]),
  },
  {
    description: 'correct name, wrong field order',
    value: createFormData([
      ['foo', 'bar'],
      ['$ACTION_REF_0', ''],
    ]),
  },
])('does not match: $description', async ({ value: formData }) => {
  const { stream, headers } = formDataToNodeStream(formData)
  const nextRequest = nodeStreamToNodeNextRequest(stream, headers)

  const [result, freshBody] = await isMPAactionRequest(nextRequest)

  expect(result).toBe(false)
  expect(freshBody).not.toBe(null)

  // the new body should still be deserializable to its original value
  const newFormData = await nodeStreamToFormData(
    freshBody!,
    headers as HeadersInit
  )
  expect([...formData.entries()]).toEqual([...newFormData.entries()])
})
