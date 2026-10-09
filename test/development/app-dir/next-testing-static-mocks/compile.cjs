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
      const setupFiles =
        file === 'setup-mock.js' ? [join(process.cwd(), 'setup.js')] : []
      const entry = {
        id: file,
        file: join(process.cwd(), 'specs', file),
        profile,
      }
      try {
        const artifact = await compiler.compile(entry, {
          signal: new AbortController().signal,
          setupFiles,
        })
        records.push({ file, entry, artifact, setupFiles })
      } catch (error) {
        records.push({
          file,
          compilationError: error.message,
          compilationErrorName: error.name,
        })
      }
    }
    await compiler.shutdownCompilation()
    for (const record of records) {
      if (!record.artifact) continue
      const events = []
      const result = await execute(record.artifact, {
        runId: 'static-mocks',
        projectDir: process.cwd(),
        entry: record.entry,
        setupFiles: record.setupFiles,
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
    console.log('STATIC_MOCK_RESULTS=' + JSON.stringify(records))
  )
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
