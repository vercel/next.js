import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export function readResultEvents(path) {
  const events = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse)
  assert(events.length > 0, 'Public CLI result events required')
  for (const event of events) {
    assert.equal(event.version, 1)
    assert.equal(typeof event.runId, 'string')
    assert(event.runId.length > 0)
    assert.equal(event.runId, events[0].runId)
  }
  assert.equal(events[0].type, 'run-start')
  assert.equal(events.at(-1).type, 'run-end')
  assert.equal(events.filter((event) => event.type === 'run-start').length, 1)
  assert.equal(events.filter((event) => event.type === 'run-end').length, 1)
  return events
}

export function assertSuccessfulRun(events, { cases, files, errors = 0 }) {
  assert.equal(events.at(-1).status, 'passed')
  const completedFiles = events.filter((event) => event.type === 'file-end')
  const startedFiles = events.filter((event) => event.type === 'file-start')
  assert.deepEqual(
    completedFiles.map((event) => event.entryId).sort(),
    startedFiles.map((event) => event.entry.id).sort(),
    'Every selected file must complete'
  )
  assert.equal(
    new Set(completedFiles.map((event) => event.entryId)).size,
    completedFiles.length
  )
  if (files !== undefined) assert.equal(completedFiles.length, files)
  assert(completedFiles.every((event) => event.status === 'passed'))
  const latest = new Map()
  const attempts = new Set()
  let actualErrors = 0
  for (const event of events) {
    if (event.type === 'diagnostic' && event.diagnostic.severity === 'error')
      actualErrors++
    if (event.type !== 'case-end') continue
    const identity = JSON.stringify([
      event.entryId,
      event.caseId,
      event.attempt.id,
    ])
    assert(!attempts.has(identity), 'Duplicate terminal attempt')
    attempts.add(identity)
    const key = JSON.stringify([
      event.entryId,
      event.caseId,
      event.attempt.repeat,
    ])
    const previous = latest.get(key)
    if (!previous || previous.attempt.retry < event.attempt.retry)
      latest.set(key, event)
    actualErrors += event.errors.filter(
      (error) => error.severity === 'error'
    ).length
  }
  assert.equal(latest.size, cases)
  assert([...latest.values()].every((event) => event.status === 'passed'))
  assert.equal(actualErrors, errors)
}
