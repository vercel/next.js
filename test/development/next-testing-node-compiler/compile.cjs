const { join } = require('path')
const { readFile } = require('fs/promises')
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')

async function main() {
  const environment = process.argv[2]
  const file = process.argv[3]
  const entry = {
    id: `${environment}:${file}`,
    file: join(process.cwd(), 'specs', file),
    profile: {
      id: environment,
      environment,
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  }
  const compiler = await createTestCompilerSession(process.cwd(), entry.profile)
  try {
    let artifact
    try {
      artifact = await compiler.compile(entry, {
        signal: new AbortController().signal,
      })
    } catch (error) {
      return { compilationError: error.message }
    }
    await compiler.shutdownCompilation()
    const retained =
      (await readFile(join(artifact.rootDir, artifact.entryPath), 'utf8'))
        .length > 0
    if (environment === 'browser') return { artifact, retained }
    const events = []
    const result = await execute(artifact, {
      runId: 'compiler-context',
      projectDir: process.cwd(),
      entry,
      setupFiles: [],
      testTimeout: 10000,
      hookTimeout: 10000,
      fileTimeout: 30000,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    })
    return { artifact, retained, result, events }
  } finally {
    await compiler.dispose()
  }
}
main()
  .then((result) =>
    console.log('NEXT_TEST_CONTEXT_RESULT=' + JSON.stringify(result))
  )
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
