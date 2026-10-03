import { uncork } from './upgrade-output'

// Errors use the same streams as normal logs and may still be corked. Let the
// parent restore the terminal before flushing them and exiting the work process.
process.on('uncaughtException', async (err) => {
  console.error('uncaughtException', err)
  await uncork()
  process.exit(1)
})

process.on('unhandledRejection', async (err) => {
  console.error('unhandledRejection', err)
  await uncork()
  process.exit(1)
})
