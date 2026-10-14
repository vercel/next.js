const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')
const {
  startCoverage,
} = require('next/dist/experimental/testing/coverage/collector')

async function main() {
  const artifact = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const collector = await startCoverage(artifact)
  try {
    require(join(artifact.rootDir, artifact.entryPath))
    const capture = await collector.stop()
    writeFileSync(process.argv[3], JSON.stringify(capture))
  } finally {
    await collector.dispose()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
