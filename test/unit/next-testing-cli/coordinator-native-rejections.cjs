require('./coordinator-snapshot-runner.cjs')(true).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
