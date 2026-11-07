require('./result-cache-runner.cjs')().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
