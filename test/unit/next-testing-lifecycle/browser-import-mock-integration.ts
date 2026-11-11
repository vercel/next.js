import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getAssertionRuntime,
  initializeTestFile,
} from 'next/dist/experimental/testing/runner'
import * as common from 'next/dist/experimental/testing/vitest'
import {
  initializeModuleMocking,
  importFreshModuleMock,
} from 'next/dist/experimental/testing/mocking/runtime'
import type {
  BrowserMockContext,
  BrowserMockOriginalLoader,
} from 'next/dist/experimental/testing/mocking/fresh-module'

it('uses the genuine file automocker for an original completed in afterAll', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-browser-import-mock-'))
  const file = initializeTestFile({
    fileId: 'browser-import-mock',
    filePath: join(directory, 'subject.test.mjs'),
    resourceLifetime: 'file',
  })
  let begin!: () => void, release!: () => void
  const started = new Promise<void>((resolve) => {
    begin = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const parent = { id: 'adapter', parents: [], children: [] } as any
  const c = new Map<string | number, any>([['adapter', parent]])
  const M = new Map<string | number, Function>([
    [
      'actual',
      (context: BrowserMockContext) => {
        context.a((_dependencies: unknown, done: (error?: unknown) => void) => {
          begin()
          void gate.then(() => {
            Object.assign(context.e, {
              fn: () => 'actual',
              nested: { fn: () => 1 },
            })
            done()
          }, done)
        }, true)
      },
    ],
  ])
  const prototype = {
    c,
    M,
    F: (path: string) => `file:///ROOT/${path}`,
    n(this: BrowserMockContext, namespace: Record<string, unknown>) {
      this.m.exports = this.m.namespaceObject = namespace
    },
    a(this: BrowserMockContext, body: Function) {
      let value: unknown = this.e
      let resolve!: (value: unknown) => void, reject!: (error: unknown) => void
      const promise = new Promise((yes, no) => {
        resolve = yes
        reject = no
      })
      const attributes = {
        get: () => promise,
        set: (next: unknown) => {
          value = next
        },
      }
      Object.defineProperty(this.m, 'exports', attributes)
      Object.defineProperty(this.m, 'namespaceObject', attributes)
      body(
        () => [],
        (error?: unknown) => (error ? reject(error) : resolve(value))
      )
    },
    i(this: BrowserMockContext, id: string | number) {
      const record = {
        id,
        parents: [this.m.id],
        children: [],
        exports: {},
      } as any
      this.m.children.push(id)
      c.set(id, record)
      const context = Object.assign(Object.create(prototype), {
        m: record,
        e: record.exports,
      })
      Reflect.apply(M.get(id)!, undefined, [context])
      return record.namespaceObject ?? record.exports
    },
  }
  const context = Object.assign(Object.create(prototype), { m: parent })
  const load: BrowserMockOriginalLoader = async (evaluate) =>
    evaluate(context, 'actual', 'subject.mjs')
  const mocks = initializeModuleMocking({
    captureAutomock: () => getAssertionRuntime().captureFileMockObject(),
  })
  let pending: Promise<Record<string, unknown>> | undefined
  let held: any
  const observations: unknown[] = []
  try {
    await file.collect(async () => {
      common.test(
        'begins import without waiting for permanent file cleanup',
        async () => {
          pending = importFreshModuleMock(load)
          await started
          observations.push('started')
        }
      )
      common.afterAll(async () => {
        release()
        held = await pending
        assert.equal(common.vi.isMockFunction(held.fn), true)
        assert.equal(common.vi.isMockFunction(held.nested.fn), true)
        assert.equal(held.fn(), undefined)
        held.fn.mockReturnValue('afterAll')
        assert.equal(held.fn(), 'afterAll')
        observations.push('materialized-in-afterAll')
      })
    })
    const result = await file.run({
      runId: 'browser-import-mock',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
    assert.deepEqual(observations, ['started', 'materialized-in-afterAll'])
    assert.equal(held.fn.mock.calls.length, 2)
    assert.equal(c.size, 2)
    await file.dispose()
    assert.equal(held.fn.mock.calls.length, 0)
    assert.throws(() => held.fn.mockReturnValue('late'), /active|disposed/)
  } finally {
    release()
    try {
      await file.dispose()
    } finally {
      try {
        mocks.dispose()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
  assert.deepEqual([...M.keys()], ['actual'])
  assert.equal(c.size, 1)
  assert.deepEqual(parent.children, [])
})
