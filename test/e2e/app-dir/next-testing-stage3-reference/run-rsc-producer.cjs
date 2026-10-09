const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { existsSync, readFileSync, realpathSync } = require('node:fs')
const { join } = require('node:path')
const { createHash } = require('node:crypto')

const nativeLoads = []
const dlopen = process.dlopen
process.dlopen = function (module, filename, ...args) {
  if (
    String(filename).includes('next-swc') &&
    String(filename).endsWith('.node')
  ) {
    nativeLoads.push({
      pid: process.pid,
      path: realpathSync(filename),
      sha256: createHash('sha256').update(readFileSync(filename)).digest('hex'),
    })
  }
  return dlopen.call(this, module, filename, ...args)
}
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')

async function main() {
  const projectDir = process.cwd()
  const profile = {
    id: 'internal-production-rsc',
    mode: 'production',
    environment: 'rsc',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = {
    id: 'internal-production-rsc:subject',
    file: join(projectDir, 'cases/production-rsc.case.mjs'),
    profile,
  }
  const evidence = {
    lane: 'internal producer, not public CLI acceptance',
    profile,
    nativeLoads,
    events: [],
    errors: [],
  }
  let compiler
  let artifact
  try {
    compiler = await createTestCompilerSession(projectDir, profile)
    const signal = new AbortController().signal
    artifact = await compiler.compile(entry, { signal })
    assert.equal(artifact.kind, 'rsc')
    assert.equal(artifact.profile.mode, 'production')
    assert.equal(artifact.requestContext.mode, 'production')
    assert.equal(typeof artifact.requestContext.buildId, 'string')
    assert(artifact.requestContext.buildId.length > 0)
    assert.notEqual(artifact.requestContext.buildId, 'development')
    evidence.artifact = {
      kind: artifact.kind,
      revision: artifact.revision,
      files: artifact.files,
      manifestPage: artifact.manifestPage,
      mode: artifact.requestContext.mode,
      buildId: artifact.requestContext.buildId,
    }
    await compiler.shutdownCompilation()
    assert(existsSync(join(artifact.rootDir, artifact.entryPath)))
    evidence.result = await execute(artifact, {
      runId: 'l3-internal-production-rsc',
      projectDir,
      entry,
      setupFiles: [],
      signal,
      testTimeout: 15000,
      hookTimeout: 15000,
      fileTimeout: 60000,
      onEvent(event) {
        evidence.events.push(event)
      },
    })
    assert.equal(evidence.result.status, 'passed')
    const cases = evidence.events.filter((event) => event.type === 'case-end')
    assert.equal(cases.length, 2)
    assert(cases.every((event) => event.status === 'passed'))
    assert(nativeLoads.length > 0)
  } catch (error) {
    evidence.errors.push(error.stack || String(error))
  } finally {
    try {
      await compiler?.dispose()
    } catch (error) {
      evidence.errors.push(error.stack || String(error))
    }
    evidence.artifactRemoved = artifact ? !existsSync(artifact.rootDir) : null
    await fs.writeFile(
      'l3-rsc-producer-evidence.json',
      JSON.stringify(evidence, null, 2)
    )
  }
  assert.deepEqual(evidence.errors, [], 'See l3-rsc-producer-evidence.json')
  assert.equal(evidence.artifactRemoved, true)
  console.log('L3_INTERNAL_PRODUCTION_RSC_PASSED')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
