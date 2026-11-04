const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')
const { runInNewContext } = require('node:vm')
const { createHash } = require('node:crypto')

/** One actual producer process; native send callbacks never stand in for reporter replies. */
module.exports = async function runProducer({
  project,
  dir,
  name,
  capture = true,
  attachmentsDir,
}) {
  let updates, client, receive, originalCopy
  let copyCalls = 0
  const controller = new AbortController()
  const send = (message) =>
    new Promise((resolve, reject) => {
      if (!process.send || !process.connected) {
        reject(
          new Error('Test record producer requires its owned IPC channel.')
        )
        return
      }
      process.send(message, (error) => (error ? reject(error) : resolve()))
    })
  const dispose = () => {
    updates?.dispose()
    updates = undefined
    client?.close()
    client = undefined
    if (receive) process.removeListener('message', receive)
    receive = undefined
    if (originalCopy) fsPromises.copyFile = originalCopy
    originalCopy = undefined
  }

  try {
    const req = createRequire(path.join(project, 'package.json'))
    const next = path.dirname(req.resolve('next/package.json'))
    req(next + '/dist/server/node-environment-baseline')
    const { createCollector } = req(
      next + '/dist/experimental/testing/runner/collector'
    )
    const { runCollected } = req(
      next + '/dist/experimental/testing/runner/lifecycle'
    )
    const { recordArtifact } = req(
      next + '/dist/experimental/testing/runner/artifacts'
    )
    const { retainAnnotationAttachment } = req(
      next + '/dist/experimental/testing/runner/annotations'
    )
    const { captureReporterTaskTree } = req(
      next + '/dist/experimental/testing/reporting/live-tasks'
    )
    const { createReporterTaskUpdates } = req(
      next + '/dist/experimental/testing/reporting/task-updates'
    )
    const { createTestRecordClient } = req(
      next + '/dist/experimental/testing/execution/test-records'
    )
    const { serializeDiagnostic } = req(
      next + '/dist/experimental/testing/reporting/diagnostics'
    )
    const { setBundlerFindSourceMapImplementation } = req(
      next + '/dist/server/patch-error-inspect'
    )
    const { mapTestAnnotationLocation } = req(
      next + '/dist/experimental/testing/reporting/source-mapped-diagnostics'
    )
    const { mapTestArtifactLocation } = req(
      next + '/dist/experimental/testing/reporting/artifact-location'
    )
    const file = path.join(dir, 'contract.test.mjs')
    const body = fs.readFileSync(file, 'utf8')
    const revision = createHash('sha256').update(body).digest('hex')
    const runId = 'owned-record-' + name
    process.env.AA_TRACE ??= path.join(dir, 'trace.jsonl')
    process.env.AA_WORKER = path.join(dir, 'body-worker.json')
    const sourceLookup = () => undefined
    sourceLookup.originalSource = (value) =>
      value === file
        ? { file, content: body, sha256: revision, ignored: false }
        : undefined
    setBundlerFindSourceMapImplementation(sourceLookup)

    if (name === 'local-attachment') {
      const input = path.join(dir, 'input.txt')
      originalCopy = fsPromises.copyFile
      fsPromises.copyFile = (...args) => {
        if (args[0] === input) copyCalls++
        return originalCopy(...args)
      }
    }

    const collector = createCollector('actual-record-' + name)
    const code = body.replace(/^import[^\n]*\n/gm, '\n')
    runInNewContext(
      code,
      {
        fs,
        process,
        Error,
        AggregateError,
        test: collector.api.test,
        recordArtifact,
      },
      { filename: file }
    )
    await collector.settle()

    let actualFile, initialTree
    const event = (payload) =>
      send({
        type: 'event',
        event: {
          version: 1,
          timestamp: Date.now(),
          runId,
          entryId: actualFile.id,
          revision,
          ...payload,
        },
      })
    const scope = (context) => ({
      caseId: context.testId,
      attempt: { id: context.id, retry: context.retry, repeat: context.repeat },
    })
    const failure = (value) =>
      serializeDiagnostic(value.error, {
        phase: value.phase === 'cleanup' ? 'cleanup' : 'runtime',
      })
    const projectCaseResult = (value) =>
      structuredClone({
        ...value,
        revision,
        errors: value.errors.map(failure),
      })
    updates = createReporterTaskUpdates({
      captureCaseReady: true,
      onUpdate(packet) {
        return event({ type: 'task-update', ...packet })
      },
    })
    receive = (message) => {
      if (message?.type !== 'test-recorded') return
      try {
        if (!client) throw new Error('Unrequested test record acknowledgement.')
        client.receive(message)
      } catch (error) {
        controller.abort(error)
      }
    }
    process.on('message', receive)
    const record = async (payload) => {
      // Preserve the real producer's existing barrier, including any collapsed
      // failure. Only the independent IPC transport changes in this helper.
      await updates.finish()
      assert(client, 'A real collected file must own the record client.')
      return client.record({
        version: 1,
        timestamp: Date.now(),
        runId,
        entryId: actualFile.id,
        revision,
        ...payload,
      })
    }
    const result = await runCollected(
      collector.close(),
      {
        runId,
        signal: controller.signal,
        filePath: file,
        projectName: 'annotation-artifact',
        projectDir: dir,
        testTimeout: 5000,
        hookTimeout: 5000,
        ...(capture ? { captureTestRecords: true } : {}),
        ...(attachmentsDir ? { attachmentsDir } : {}),
        getAnnotationLocation: (error) =>
          mapTestAnnotationLocation(error, file),
        getArtifactLocation: (error) => mapTestArtifactLocation(error, file),
        async onCollected(value) {
          actualFile = value
          initialTree = captureReporterTaskTree(value)
          if (capture)
            client = createTestRecordClient({
              identity: { runId, entryId: value.id, revision },
              signal: controller.signal,
              send,
            })
          await event({ type: 'file-collected', taskTree: initialTree })
          updates.collected(value)
        },
        onCaseStart(context) {
          updates.caseStart(context.testId)
          return event({
            type: 'case-start',
            ...scope(context),
            name: context.name,
            testName: context.testName,
            ancestors: context.ancestors,
            mode: context.mode,
          })
        },
        onCaseEnd(value) {
          return event({ type: 'case-end', ...projectCaseResult(value) })
        },
        onCaseReady(task) {
          updates.caseReady(task)
        },
        onCaseResult(task, value) {
          updates.caseResult(task, projectCaseResult(value))
        },
        onSuiteEnd(value, task) {
          const completion = event({
            type: 'suite-end',
            ...value,
            revision,
            errors: value.errors.map(failure),
          })
          return completion.then(() => updates.suiteEnd(task))
        },
        onAnnotation(context, annotation) {
          const payload = {
            ...scope(context),
            type: 'test-annotation',
            annotation,
          }
          if (!capture) return event(payload)
          return record(payload).then((value) => value.annotation)
        },
        ...(capture
          ? {
              async onTestRecordArtifact(context, artifact) {
                const resolved = structuredClone(artifact)
                if (Array.isArray(resolved.attachments))
                  await Promise.all(
                    resolved.attachments.map((attachment) =>
                      retainAnnotationAttachment(attachment, '', {
                        projectDir: dir,
                        attachmentsDir,
                      })
                    )
                  )
                return record({
                  ...scope(context),
                  type: 'test-artifact',
                  artifact: resolved,
                })
              },
            }
          : {}),
        onArtifact(context, artifact) {
          if (!capture)
            return event({
              ...scope(context),
              type: 'test-artifact',
              artifact,
            })
        },
      },
      () => {}
    )
    await updates.finish()
    await client?.flush()
    dispose()
    await send({ type: 'producer-result', result, initialTree, copyCalls })
  } catch (error) {
    process.exitCode = 1
    if (process.connected)
      await send({ type: 'producer-error', error }).catch(() => {})
  } finally {
    dispose()
    if (process.connected) process.disconnect()
  }
}
