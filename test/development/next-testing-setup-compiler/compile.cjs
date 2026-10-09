const { join } = require('path')
const { readFile, writeFile, mkdtemp, rm } = require('fs/promises')
const { randomUUID } = require('crypto')
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')

async function main() {
  const environment = process.argv[2]
  const file = process.argv[3]
  const setupFiles = process.argv
    .slice(4)
    .map((file) => join(process.cwd(), 'setup', file))
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
  const allocated = []
  const compiler = await createTestCompilerSession(
    process.cwd(),
    entry.profile,
    {
      ...(process.env.NEXT_TEST_MUTATE_SETUP === '1'
        ? {
            async allocateArtifact(parentDir) {
              const allocation = {
                stagingDir: await mkdtemp(
                  join(parentDir, '.next-test-pending-parent-')
                ),
                rootDir: join(parentDir, `.next-test-parent-${randomUUID()}`),
              }
              allocated.push(allocation.stagingDir, allocation.rootDir)
              return allocation
            },
          }
        : {}),
    }
  )
  const originals = new Map()
  try {
    let artifact
    try {
      artifact = await compiler.compile(entry, {
        signal: new AbortController().signal,
        setupFiles,
      })
    } catch (error) {
      return { compilationError: error.message }
    }
    await compiler.shutdownCompilation()
    if (process.env.NEXT_TEST_MUTATE_SETUP === '1') {
      for (const setupFile of setupFiles) {
        originals.set(setupFile, await readFile(setupFile))
        await writeFile(
          setupFile,
          "throw new Error('mutable setup source was loaded')"
        )
      }
    }
    const retained =
      (await readFile(join(artifact.rootDir, artifact.entryPath), 'utf8'))
        .length > 0
    if (environment === 'browser') return { artifact, retained }
    const events = []
    const result = await execute(artifact, {
      runId: 'compiler-context',
      projectDir: process.cwd(),
      entry,
      setupFiles,
      testTimeout: 10000,
      hookTimeout: 10000,
      fileTimeout: 30000,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    })
    return { artifact, retained, result, events }
  } finally {
    try {
      await compiler.dispose()
    } finally {
      try {
        for (const [file, source] of originals) await writeFile(file, source)
      } finally {
        for (const directory of allocated)
          await rm(directory, { recursive: true, force: true })
      }
    }
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
