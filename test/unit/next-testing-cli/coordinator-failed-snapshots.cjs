require('./coordinator-snapshot-runner.cjs')(false).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
