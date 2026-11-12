import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

// Shared by the actual packed verifier and its synthetic false-pass controls.
export function assertBrowserArtifacts(
  events,
  { expected, consumer, project, previousArtifacts = [] }
) {
  const digest = (path) =>
    createHash('sha256').update(readFileSync(path)).digest('hex')
  const artifacts = [...previousArtifacts]
  const start = artifacts.length
  const seenNames = new Set()
  const passed = new Map()
  const identityOf = (event) =>
    JSON.stringify([
      event.runId,
      event.entryId,
      event.caseId,
      event.attempt?.id,
      event.attempt?.retry,
      event.attempt?.repeat,
    ])
  const entries = new Map(
    events
      .filter((event) => event.type === 'file-start')
      .map((event) => [event.entry.id, event.entry])
  )
  for (const [index, event] of events.entries()) {
    if (event.type !== 'case-end' || event.status !== 'passed') continue
    const identity = identityOf(event)
    assert(
      expected.has(event.name),
      `Unexpected passing browser case: ${event.name}`
    )
    assert(
      !seenNames.has(event.name),
      `Duplicate expected browser case: ${event.name}`
    )
    seenNames.add(event.name)
    const entry = entries.get(event.entryId)
    assert(
      entry && event.caseId && event.attempt?.id,
      'Missing browser case/attempt attribution'
    )
    assert.equal(event.attempt.retry, 0)
    assert.equal(event.attempt.repeat, 0)
    assert.equal(
      realpathSync(entry.file),
      realpathSync(join(consumer, expected.get(event.name)))
    )
    assert(!passed.has(identity), 'Duplicate passing browser attempt')
    passed.set(identity, {
      name: event.name,
      file: entry.file,
      runId: event.runId,
      entryId: event.entryId,
      caseId: event.caseId,
      attemptId: event.attempt.id,
      retry: event.attempt.retry,
      repeat: event.attempt.repeat,
      endOffset: index,
    })
  }
  assert.deepEqual(
    [...seenNames].sort(),
    [...expected.keys()].sort(),
    'Missing expected browser name/file pair'
  )
  assert.equal(passed.size, expected.size)
  for (const [index, event] of events.entries()) {
    if (
      event.type !== 'attachment' ||
      !['screenshot', 'trace'].includes(event.attachment.kind)
    )
      continue
    const kind = event.attachment.kind
    const identity = identityOf(event)
    const scope = passed.get(identity)
    assert(scope, 'Artifact must belong to an actual expected browser attempt')
    assert(
      index < scope.endOffset,
      'Artifact must precede its terminal case event'
    )
    const path = realpathSync(event.attachment.path)
    assert(
      !artifacts.some((artifact) => artifact.path === path),
      'Browser artifacts must have unique real paths'
    )
    assert(
      !artifacts.some(
        (artifact) =>
          artifact.project === project &&
          artifact.identity === identity &&
          artifact.kind === kind
      ),
      'Duplicate artifact kind for an attempt'
    )
    const bytes = readFileSync(path)
    assert(bytes.length > 0)
    assert.equal(
      bytes.subarray(0, kind === 'screenshot' ? 8 : 4).toString('hex'),
      kind === 'screenshot' ? '89504e470d0a1a0a' : '504b0304'
    )
    artifacts.push({
      project,
      kind,
      identity,
      ...scope,
      artifactOffset: index,
      path,
      sha256: digest(path),
    })
  }
  for (const identity of passed.keys()) {
    for (const kind of ['screenshot', 'trace'])
      assert.equal(
        artifacts.filter(
          (artifact) =>
            artifact.project === project &&
            artifact.identity === identity &&
            artifact.kind === kind
        ).length,
        1
      )
  }

  return artifacts.slice(start)
}
