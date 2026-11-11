import {
  test,
  expect,
  describe,
  beforeEach,
  afterEach,
  afterAll,
  onTestFailed,
  onTestFinished,
} from 'vitest'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const trace = []
const owned = new Map()
const signals = []
let retries = 0
let repeats = 0
let retrySignal
let repeatSignal
beforeEach(({ task }) => {
  expect(task.type).toBe('test')
  expect(task.file.filepath).toContain('task-context.case.mjs')
  expect(task.context.task).toBe(task)
  owned.set(task.name, task)
  onTestFailed(({ task: failed }) =>
    trace.push([
      'failed',
      failed.name,
      failed.result.state,
      failed.result.errors.map((error) => error.message),
    ])
  )
})
afterEach(({ task }) => trace.push(['afterEach', task.name, task.result.state]))
test('root task graph', ({ task, signal }) => {
  expect(task.suite).toBeUndefined()
  expect(task.file.file).toBe(task.file)
  expect(task.file.tasks.find((child) => child.id === task.id)).toBe(task)
  expect(task.fullTestName).toBe(task.name)
  expect(task.fullName.endsWith(task.name)).toBe(true)
  signals.push(signal)
  task.meta.changed = 42
})
describe(
  'parent',
  { tags: ['low'], meta: { suiteValue: 1, overlap: 'suite' } },
  () => {
    describe('nested', { meta: { nested: 2 } }, () => {
      test(
        'metadata',
        { tags: ['high', 'low'], meta: { own: 3, overlap: 'own' } },
        ({ task }) => {
          expect(task.tags).toEqual(['low', 'high'])
          expect(task.meta).toMatchObject({
            suiteValue: 1,
            nested: 2,
            own: 3,
            overlap: 'own',
            fromLow: true,
            fromHigh: true,
          })
          expect(task.suite.name).toBe('nested')
          expect(task.suite.suite.name).toBe('parent')
          expect(task.suite.file).toBe(task.file)
          expect(task.suite.tasks[0]).toBe(task)
          trace.push(['metadata', task.tags, task.meta])
        }
      )
    })
  }
)
test('retry result history', { retry: 1 }, ({ task, signal }) => {
  expect(task).toBe(owned.get(task.name))
  trace.push([
    'retry',
    task.result.state,
    task.result.retryCount,
    task.result.repeatCount,
    (task.result.errors || []).map((error) => error.message),
  ])
  if (retrySignal) expect(signal).toBe(retrySignal)
  retrySignal = signal
  signals.push(signal)
  if (++retries === 1) throw new Error('retry body')
})
test('repeat result history', { repeats: 1 }, ({ task, signal }) => {
  if (repeatSignal) expect(signal).toBe(repeatSignal)
  repeatSignal = signal
  trace.push([
    'repeat',
    task.result.state,
    task.result.retryCount,
    task.result.repeatCount,
    (task.result.errors || []).map((error) => error.message),
  ])
  if (++repeats === 1) throw new Error('repeat body')
})
test.fails('expected failure metadata', ({ signal }) => {
  signals.push(signal)
  throw new Error('expected body')
})
test('regular benchmark diagnostic', ({ bench }) => {
  expect(typeof bench).toBe('function')
  expect(() => bench('work', () => 42)).toThrow(
    'Cannot use the `bench` test-context fixture within a regular test run'
  )
})
test('annotations and attachments', async ({ task, annotate }) => {
  const notice = await annotate('notice')
  expect(notice.type).toBe('notice')
  expect(notice.location.file).toBe(task.file.filepath)
  expect(notice.location.line).toBeGreaterThan(0)
  expect(notice.location.column).toBeGreaterThan(0)
  const text = await annotate('text', {
    body: 'plain',
    bodyEncoding: 'utf-8',
    contentType: 'text/plain',
  })
  expect(text.attachment.body).toBe('plain')
  expect(text.attachment.bodyEncoding).toBe('utf-8')
  const binary = await annotate('binary', 'evidence', {
    body: new Uint8Array([1, 2, 3]),
  })
  expect(binary.attachment.body).toBe('AQID')
  expect(binary.attachment.bodyEncoding).toBe('base64')
  const file = await annotate('file note', { path: 'annotation-evidence.txt' })
  expect(await readFile(file.attachment.path, 'utf8')).toBe(
    'release evidence\n'
  )
  expect(file.attachment.contentType).toBe('text/plain')
  expect(basename(file.attachment.path)).toBe(
    'file-note-' +
      createHash('sha1')
        .update(resolve('annotation-evidence.txt'))
        .digest('hex') +
      '.txt'
  )
  const remote = await annotate('remote', {
    path: 'https://example.com/evidence.txt',
  })
  expect(remote.attachment.path).toBe('https://example.com/evidence.txt')
  expect(task.annotations[0]).toBe(notice)
  expect(() => annotate('missing', {})).toThrow('Both are missing')
  expect(() =>
    annotate('both', { path: 'annotation-evidence.txt', body: 'duplicate' })
  ).toThrow('Both are specified')
  expect(() =>
    annotate('encoding', {
      path: 'annotation-evidence.txt',
      bodyEncoding: 'utf-8',
    })
  ).toThrow('should not have')
  await expect(
    annotate('absent', { path: 'does-not-exist.txt' })
  ).rejects.toThrow('ENOENT')
  annotate('unawaited')
  onTestFinished(() => {
    expect(() => annotate('too late')).toThrow(
      'finished running with the "pass" state'
    )
    expect(task.annotations.map((note) => note.message)).toEqual([
      'notice',
      'text',
      'binary',
      'file note',
      'remote',
      'unawaited',
    ])
  })
})
test.fails('soft failure is immediately visible', ({ task, annotate }) => {
  expect.soft(1).toBe(2)
  expect(task.result.state).toBe('fail')
  expect(task.result.errors).toHaveLength(1)
  expect(() => annotate('late failed')).toThrow(
    'finished running with the "fail" state'
  )
})
test('tag skip', { tags: 'disabled' }, () => {
  throw new Error('tag skip ignored')
})
test.skip('static skipped metadata')
test.todo('static todo metadata')
afterAll(() => {
  expect(signals.every((signal) => !signal.aborted)).toBe(true)
  expect(owned.get('root task graph').meta.changed).toBe(42)
  expect(owned.get('retry result history').result.state).toBe('pass')
  expect(
    owned
      .get('retry result history')
      .result.errors.map((error) => error.message)
  ).toEqual(['retry body'])
  expect(owned.get('repeat result history').result.state).toBe('fail')
  expect(owned.get('expected failure metadata').result.errors).toBeUndefined()
  console.log('TASK_CONTEXT_TRACE=' + JSON.stringify(trace))
})
