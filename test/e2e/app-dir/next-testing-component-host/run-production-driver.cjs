const assert = require('node:assert/strict')
const fs = require('node:fs')
const { join } = require('node:path')
const { createHash } = require('node:crypto')
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')
const {
  createApplicationServer,
} = require('next/dist/experimental/testing/browser/server')
const {
  createBrowserHost,
} = require('next/dist/experimental/testing/browser/host')

async function main() {
  const projectDir = process.cwd()
  const outputDir = process.argv[2]
  const signal = new AbortController().signal
  const profile = {
    id: 'h3-production-browser',
    mode: 'production',
    environment: 'browser',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = {
    id: 'h3-production-driver',
    file: join(projectDir, 'cases/browser.case.mjs'),
    profile,
  }
  let compiler, server, host
  const events = []
  const errors = []
  let result, native
  try {
    compiler = await createTestCompilerSession(projectDir, profile)
    const artifact = await compiler.compile(entry, { signal })
    assert.equal(artifact.kind, 'node')
    assert.equal(artifact.applicationServer.mode, 'production')
    assert.equal(artifact.applicationServer.lockDistDir, true)
    const path = Object.keys(require.cache).find(
      (file) => file.endsWith('.node') && file.includes('next-swc')
    )
    assert.ok(path)
    native = {
      path: fs.realpathSync(path),
      sha256: createHash('sha256').update(fs.readFileSync(path)).digest('hex'),
    }
    assert.equal(native.sha256, process.argv[3])
    await compiler.shutdownCompilation()
    server = await createApplicationServer({
      projectDir,
      mode: 'production',
      distDir: artifact.applicationServer.distDir,
      outputLockEnabled: artifact.applicationServer.lockDistDir,
      outputDir,
      signal,
    })
    assert.equal(server.build.testingApiEnabled, true)
    host = await createBrowserHost({ projectDir, signal })
    result = await execute(artifact, {
      runId: 'h3-production-browser-run',
      projectDir,
      entry,
      setupFiles: [],
      testTimeout: 60_000,
      hookTimeout: 15_000,
      fileTimeout: 120_000,
      signal,
      onEvent: (event) => events.push(event),
      browser: {
        wsEndpoint: host.wsEndpoint,
        baseURL: server.baseURL,
        outputDir,
      },
    })
    assert.equal(result.status, 'passed')
    assert.equal(
      events.filter(
        (event) => event.type === 'case-end' && event.status === 'passed'
      ).length,
      1
    )
    const attachments = events.filter((event) => event.type === 'attachment')
    assert.equal(attachments.length, 2)
    for (const { attachment } of attachments)
      assert.ok(fs.statSync(attachment.path).size > 0)
  } catch (error) {
    errors.push(error)
  } finally {
    for (const resource of [host, server, compiler]) {
      try {
        await resource?.dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    fs.writeFileSync(
      join(outputDir, 'production-driver-evidence.json'),
      JSON.stringify(
        {
          result,
          native,
          events,
          errors: errors.map((error) => ({
            message: error.message,
            stack: error.stack,
          })),
        },
        null,
        2
      )
    )
  }
  if (errors.length)
    throw new AggregateError(errors, 'Production browser driver failed')
  console.log('H3_PRODUCTION_BROWSER_DRIVER_PASSED')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
