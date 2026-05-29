process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err)
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err)
  process.exit(1)
})
