import assert from 'assert'
import createInterface from './snowflake.js'
import { mock, test } from 'node:test'

test('sending measurements to the batch endpoint', async () => {
  const requests: Array<[string, RequestInit]> = []

  const fetchMock = mock.method(
    global,
    'fetch',
    (req: string, options: RequestInit) => {
      requests.push([req, options])
      return Promise.resolve(Response.json({}))
    }
  )

  const iface = createInterface({
    gatewayUri: 'http://127.0.0.1/v1/batch',
    topicName: 'my-topic',
    schemaId: 123,
  })

  assert(iface.measurement != null)
  await iface.measurement('scenario', { myprop: 'foo' }, 'one', 42, 'ms')
  await iface.measurement('scenario', { myprop: 'foo' }, 'two', 45, 'ms')
  await iface.measurement('scenario', { myprop: 'foo' }, 'three', 38, 'ms')

  assert(iface.end != null)
  await iface.end('scenario', { myprop: 'foo' })

  assert.equal(requests.length, 1)
  const [url, options] = requests[0]
  assert.equal(url, 'http://127.0.0.1/v1/batch')
  assert(typeof options.body === 'string')
  const body = JSON.parse(options.body)
  assert.equal(body.schema_id, 123)
  assert.equal(body.topic, 'my-topic')
  assert(body.records.length === 3)
  assert.equal(body.records[0].metric, 'one')
  assert.equal(body.records[0].value, 42)
  assert.equal(body.records[0].props_json, '{"myprop":"foo"}')
  assert.equal(body.records[0].unit, 'ms')
  assert.equal(body.records[1].metric, 'two')
  assert.equal(body.records[1].value, 45)
  assert.equal(body.records[1].props_json, '{"myprop":"foo"}')
  assert.equal(body.records[1].unit, 'ms')
  assert.equal(body.records[2].metric, 'three')
  assert.equal(body.records[2].value, 38)
  assert.equal(body.records[2].props_json, '{"myprop":"foo"}')
  assert.equal(body.records[2].unit, 'ms')

  fetchMock.mock.restore()
})
