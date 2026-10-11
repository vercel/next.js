const {
  createExecutionBrokerClient,
} = require('next/dist/experimental/testing/execution/broker')
const controller = new AbortController()
const client = createExecutionBrokerClient({
  send: (message) =>
    new Promise((resolve, reject) => {
      process.send(message, (error) => (error ? reject(error) : resolve()))
    }),
})
process.on('message', (message) => {
  if (client.handle(message)) return
  if (message.type !== 'start')
    throw new Error('Unexpected broker driver message')
  client
    .execute(message.artifact, {
      ...message.options,
      signal: controller.signal,
      onEvent() {},
    })
    .then(
      (result) => {
        process.send({ type: 'client-result', result }, (error) => {
          if (error) process.exitCode = 1
          process.disconnect()
        })
      },
      (error) => {
        console.error(error)
        process.exitCode = 1
        process.disconnect()
      }
    )
})
process.once('disconnect', () => {
  controller.abort()
  client.disconnect(new Error('Broker driver disconnected'))
})
