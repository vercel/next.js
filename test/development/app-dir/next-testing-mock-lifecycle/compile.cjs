const { join } = require('path')
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')

async function main() {
  const profile = {
    id: 'node',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const compiler = await createTestCompilerSession(process.cwd(), profile)
  const records = []
  try {
    for (const file of process.argv.slice(2)) {
      const entry = {
        id: file,
        file: join(process.cwd(), 'specs', file),
        profile,
      }
      try {
        const artifact = await compiler.compile(entry, {
          signal: new AbortController().signal,
        })
        records.push({ file, entry, artifact })
      } catch (error) {
        records.push({ file, compilationError: error.message })
      }
    }
    await compiler.shutdownCompilation()
    for (const record of records) {
      if (!record.artifact) continue
      const events = []
      const result = await execute(record.artifact, {
        runId: 'mock-lifecycle',
        projectDir: process.cwd(),
        entry: record.entry,
        setupFiles: [],
        testTimeout: 10000,
        hookTimeout: 10000,
        fileTimeout: 30000,
        signal: new AbortController().signal,
        onEvent: (event) => events.push(event),
      })
      record.result = result
      record.events = events
    }
    return records
  } finally {
    await compiler.dispose()
  }
}
main()
  .then((records) =>
    console.log('MOCK_LIFECYCLE_RESULTS=' + JSON.stringify(records))
  )
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
