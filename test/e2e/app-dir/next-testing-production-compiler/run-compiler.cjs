const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const nativeLoads = []
const originalDlopen = process.dlopen
process.dlopen = function (module, filename, ...args) {
  if (filename.endsWith('.node'))
    nativeLoads.push({
      path: filename,
      sha256: crypto
        .createHash('sha256')
        .update(require('node:fs').readFileSync(filename))
        .digest('hex'),
    })
  return originalDlopen.call(this, module, filename, ...args)
}
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')
async function main() {
  const dir = process.cwd()
  const profile = {
    id: 'production',
    mode: 'production',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const appPage = path.join(dir, 'app/page.tsx')
  const originalPage = await fs.readFile(appPage, 'utf8')
  await fs.writeFile(
    appPage,
    "import 'a3-unrelated-app-route-must-not-be-resolved'; export default function Page() { return null }\n"
  )
  const session = await createTestCompilerSession(dir, profile)
  const signal = new AbortController().signal
  const events = []
  try {
    const entry = {
      id: 'production-node',
      file: path.join(dir, 'cases/production.case.ts'),
      profile,
    }
    const setupFiles = [path.join(dir, 'cases/setup.ts')]
    const artifact = await session.compile(entry, { signal, setupFiles })
    assert.equal(artifact.kind, 'node')
    assert.equal(artifact.profile.mode, 'production')
    const emitted = (
      await Promise.all(
        artifact.files
          .filter((f) => f.endsWith('.js'))
          .map((f) => fs.readFile(path.join(artifact.rootDir, f), 'utf8'))
      )
    ).join('\n')
    assert(
      !emitted.includes('A3_DEVELOPMENT_BRANCH_MUST_BE_ELIMINATED'),
      'development branch survives production DCE'
    )
    const secondEntry = {
      ...entry,
      id: 'production-second',
      file: path.join(dir, 'cases/second.case.ts'),
    }
    const secondArtifact = await session.compile(secondEntry, { signal })
    await assert.rejects(
      session.compile(
        {
          ...entry,
          id: 'production-mock',
          file: path.join(dir, 'cases/mock.case.ts'),
        },
        { signal }
      ),
      /Static module mocks are not supported in production/
    )
    await session.shutdownCompilation()
    const results = []
    for (const [retained, input, setup] of [
      [artifact, entry, setupFiles],
      [secondArtifact, secondEntry, []],
    ]) {
      assert.equal(
        (
          await fs.stat(path.join(retained.rootDir, retained.entryPath))
        ).isFile(),
        true
      )
      const result = await execute(retained, {
        runId: 'a3-production',
        projectDir: dir,
        entry: input,
        setupFiles: setup,
        signal,
        testTimeout: 10000,
        hookTimeout: 10000,
        fileTimeout: 60000,
        onEvent: (e) => events.push(e),
      })
      assert.equal(result.status, 'passed', JSON.stringify({ result, events }))
      results.push(result)
    }
    await fs.writeFile(
      'compiler-evidence.json',
      JSON.stringify(
        {
          profile: artifact.profile,
          results,
          nativeLoads,
          files: artifact.files,
        },
        null,
        2
      )
    )
    console.log('A3_NATIVE_LOADS', JSON.stringify(nativeLoads))
    console.log('A3_PRODUCTION_COMPILER_PASSED')
  } finally {
    await session.dispose()
    await fs.writeFile(appPage, originalPage)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
