const { join } = require('path')
const { existsSync, readFileSync, realpathSync, writeFileSync } = require('fs')
const { createHash } = require('crypto')
const nativeLoads = []
const dlopen = process.dlopen
process.dlopen = function (module, filename, ...args) {
  nativeLoads.push({
    pid: process.pid,
    path: realpathSync(filename),
    sha256: createHash('sha256').update(readFileSync(filename)).digest('hex'),
  })
  return dlopen.call(this, module, filename, ...args)
}
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')
const {
  remapCoverage,
} = require('next/dist/experimental/testing/coverage/remap')
const {
  formatDiagnostic,
} = require('next/dist/experimental/testing/reporting/reporter')

async function main() {
  const projectDir = process.cwd()
  const profile = {
    id: 'stage3',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const coverage = { version: 1, kind: 'node-line' }
  const setupFiles = [join(projectDir, 'setup.mjs')]
  const compiler = await createTestCompilerSession(projectDir, profile)
  const artifacts = []
  const outcomes = {}
  try {
    for (const name of ['scenario', 'following']) {
      const entry = { id: name, file: join(projectDir, name + '.mjs'), profile }
      const artifact = await compiler.compile(entry, {
        setupFiles,
        coverage,
        signal: new AbortController().signal,
      })
      artifacts.push({ entry, artifact })
    }
    await compiler.shutdownCompilation()
    for (const mode of [
      'retry',
      'failure',
      'cleanup',
      'timeout',
      'cancel',
      'nonzero',
      'late',
      'missing',
      'duplicate',
      'mismatch',
      'unsolicited',
      'consumer',
      'abort-consumer',
      'abort-failed-consumer',
      'following',
    ]) {
      process.env.NEXT_TEST_STAGE3_SCENARIO = mode
      const { entry, artifact } = artifacts[mode === 'following' ? 1 : 0]
      const outcome = (outcomes[mode] = { events: [] })
      const controller = new AbortController()
      let workerPid
      try {
        outcome.result = await execute(artifact, {
          projectDir,
          entry,
          setupFiles,
          runId: 'stage3-' + mode,
          ...(mode === 'unsolicited'
            ? {}
            : {
                coverage,
                async onCoverage(completion) {
                  outcome.leaseRetained = existsSync(artifact.rootDir)
                  try {
                    process.kill(workerPid, 0)
                    outcome.workerClosed = false
                  } catch (error) {
                    if (error.code !== 'ESRCH') throw error
                    outcome.workerClosed = true
                  }
                  if (mode === 'consumer')
                    throw new Error('EXPECTED_REMAP_FAILURE')
                  if (mode === 'abort-consumer') {
                    controller.abort()
                    return
                  }
                  if (mode === 'abort-failed-consumer') {
                    controller.abort()
                    throw new Error('remap source mismatch')
                  }
                  outcome.coverage = await remapCoverage(
                    artifact,
                    completion.data
                  )
                  if (!outcome.coverage.complete)
                    throw new Error(outcome.coverage.errors.join('\n'))
                },
              }),
          testTimeout: 10000,
          hookTimeout: 10000,
          fileTimeout: 20000,
          signal: controller.signal,
          onEvent(event) {
            outcome.events.push(event)
            if (event.type === 'output') {
              const pid = event.text.match(/STAGE3_WORKER_PID=(\d+)/)
              if (pid) workerPid = Number(pid[1])
            }
            if (mode === 'cancel' && event.type === 'case-start')
              controller.abort()
          },
        })
      } catch (error) {
        outcome.error = error.message
      }
    }
  } finally {
    await compiler.dispose()
  }
  outcomes.artifactsRemoved = artifacts.every(
    ({ artifact }) => !existsSync(artifact.rootDir)
  )
  outcomes.failure.formattedDiagnostic = formatDiagnostic(
    outcomes.failure.events.find((event) => event.type === 'case-end').errors[0]
  )
  outcomes.nativeLoads = nativeLoads
  if (process.env.NEXT_TEST_STAGE3_EVIDENCE) {
    writeFileSync(
      process.env.NEXT_TEST_STAGE3_EVIDENCE,
      JSON.stringify(outcomes, null, 2)
    )
  }
  return outcomes
}
main()
  .then((outcomes) =>
    console.log('STAGE3_WORKER_RESULT=' + JSON.stringify(outcomes))
  )
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
