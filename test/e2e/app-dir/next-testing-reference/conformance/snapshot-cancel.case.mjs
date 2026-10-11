import { expect, it } from 'vitest'

const send = process.send.bind(process)
process.send = (message, callback) => {
  if (message.type !== 'complete') return send(message, callback)
  // Hold completion until the parent cancels after seeing a real staged payload.
  return send(message, (error) => {
    if (error) return callback(error)
    process.once('message', (reply) => {
      if (reply.type === 'cancel') callback(null)
    })
    console.log(
      `L_SNAPSHOT_PAYLOAD=${message.result.status}:${message.snapshotUpdates.length}`
    )
  })
}

it('selected', () => {
  expect('updated').toMatchSnapshot()
})
