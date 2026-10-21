const { acquireTestRunLock } = require(process.argv[2])

async function main() {
  const lock = await acquireTestRunLock(process.argv[3], {
    recoverSnapshots: false,
  })
  await lock.unlock()
  process.stdout.write('released')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
