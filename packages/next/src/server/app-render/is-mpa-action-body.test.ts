import { Readable } from 'node:stream'
import { isMpaActionBodyNode } from './is-mpa-action-body'

function formDataToNodeStream(formData: FormData) {
  const request = new Request('http://__n', {
    method: 'POST',
    body: formData,
  })
  const stream = Readable.fromWeb(
    request.body! as import('node:stream/web').ReadableStream<any>
  )
  return { stream, headers: Object.fromEntries(request.headers) }
}

function createFormData(entries: [name: string, value: string][]) {
  const formData = new FormData()
  for (const [name, value] of entries) {
    formData.append(name, value)
  }
  return formData
}

function fakeActionFormData(fieldName: string) {
  return createFormData([
    [fieldName, ''],
    ['$ACTION_1:0', '{"id":"01234567890abcdef","bound":"$@1"}'],
    ['$ACTION_1:1', '["$undefined"]'],
    ['$ACTION_KEY', 'k0000000000'],
    ['foo', 'bar'],
  ])
}

it.each([
  fakeActionFormData('$ACTION_REF_0'),
  fakeActionFormData('$ACTION_REF_1'),
  fakeActionFormData('$ACTION_ID_01234567890abcdef'),
  fakeActionFormData('$ACTION_ID_0'),
  createFormData([['$ACTION_REF_0', '']]), // TODO: should require more fields?
])('matches', async (formData) => {
  const { stream, headers } = formDataToNodeStream(formData)
  expect(await isMpaActionBodyNode(stream, headers)).toBe(true)
})

it.each([
  // similar names
  createFormData([['$ACTION', '']]),
  createFormData([['$ACTION_REF_', '']]),
  createFormData([['$ACTION_ID_', '']]),
  // right name, wrong (non-empty) value
  createFormData([['$ACTION_REF_0', 'xxx']]),
  createFormData([['$ACTION_REF_1', 'xxx']]),
  createFormData([['$ACTION_ID_01234567890abcdef', 'xxx']]),
  createFormData([['$ACTION_ID_0', 'xxx']]),
  // misc
  createFormData([
    ['foo', '3'],
    ['bar', '5'],
  ]),
])('does not match', async (formData) => {
  const { stream, headers } = formDataToNodeStream(formData)
  expect(await isMpaActionBodyNode(stream, headers)).toBe(false)
})
