require('./result-cache-runner.cjs')({ concurrency: true }).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
