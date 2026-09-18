const { join, dirname } = require('path')
const { mkdir, readFile, writeFile } = require('fs/promises')
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')

async function main() {
  const mode = process.argv[2]
  const snapshot = mode.startsWith('snapshot')
  const profile = {
    id: 'setup',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const projectDir = process.cwd()
  const setupFiles = (
    mode === 'snapshot-nonzero'
      ? ['first.mjs', 'nonzero.mjs']
      : mode === 'failure'
        ? ['first.mjs', 'failure.mjs', 'forbidden.mjs']
        : ['first.mjs', 'second.mjs']
  ).map((file) => join(projectDir, 'setup', file))
  const files = snapshot
    ? [mode === 'snapshot-late' ? 'snapshot-late.mjs' : 'snapshot.mjs']
    : mode === 'failure'
      ? ['forbidden.mjs']
      : ['a.mjs', 'b.mjs']
  const snapshotPath = join(
    projectDir,
    'specs',
    '__snapshots__',
    files[0] + '.snap'
  )
  const originalSnapshot =
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`snapshot 1`] = `"previous"`;\n\nexports[`unselected 1`] = `"preserved"`;\n'
  if (snapshot) {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await writeFile(snapshotPath, originalSnapshot)
  }
  const compiler = await createTestCompilerSession(projectDir, profile)
  try {
    const compiled = []
    for (const file of files) {
      const entry = {
        id: 'setup:' + file,
        file: join(projectDir, 'specs', file),
        profile,
      }
      const artifact = await compiler.compile(entry, {
        signal: new AbortController().signal,
        setupFiles,
      })
      compiled.push({ entry, artifact })
    }
    await compiler.shutdownCompilation()
    const outcomes = []
    for (const { entry, artifact } of compiled) {
      const events = []
      const result = await execute(artifact, {
        runId: 'compiled-setup',
        projectDir,
        entry,
        setupFiles,
        updateSnapshots: snapshot && mode !== 'snapshot-readonly',
        testTimeout: 10000,
        hookTimeout: 10000,
        fileTimeout: 30000,
        signal: new AbortController().signal,
        onEvent: (event) => events.push(event),
      })
      outcomes.push({
        setupFiles: artifact.setupFiles,
        requested: setupFiles,
        ...(snapshot
          ? { originalSnapshot, snapshot: await readFile(snapshotPath, 'utf8') }
          : {}),
        result,
        events,
      })
    }
    return outcomes
  } finally {
    await compiler.dispose()
  }
}
main()
  .then((outcomes) =>
    console.log('COMPILED_SETUP_RESULT=' + JSON.stringify(outcomes))
  )
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
