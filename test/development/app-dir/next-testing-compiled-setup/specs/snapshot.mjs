import { expect, test } from 'vitest'

const send = process.send.bind(process)
process.send = (message, ...args) => {
  if (message.type === 'complete') {
    console.log('SNAPSHOT_WORKER_STATUS=' + message.result.status)
  }
  return send(message, ...args)
}

test('snapshot', () => {
  expect('updated').toMatchSnapshot()
})
