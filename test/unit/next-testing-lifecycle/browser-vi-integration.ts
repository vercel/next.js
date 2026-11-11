import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInThisContext } from 'node:vm'
import {
  getActiveAttempt,
  initializeTestFile,
} from 'next/dist/experimental/testing/runner'
import { getOriginatingCollection } from 'next/dist/experimental/testing/runner/async-context'
import { createAsyncScope } from 'next/dist/experimental/testing/client/async-context'
import * as browser from 'next/dist/experimental/testing/client/vitest'
import * as common from 'next/dist/experimental/testing/vitest'

it('reuses genuine backend globals and keeps fluent returns on the Browser facade', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-browser-vi-facade-'))
  const file = initializeTestFile({
    fileId: 'browser-vi',
    filePath: join(directory, 'browser-vi.test.mjs'),
    resourceLifetime: 'file',
  })
  const rows: unknown[] = []
  const late: Error[] = []
  const log = console.log
  const aliases = new Map(
    ['window', 'self'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  let collectionScope: ReturnType<typeof createAsyncScope> | undefined
  let retained: typeof browser.vi.stubGlobal | undefined
  try {
    assert.throws(
      () => browser.vi.stubGlobal,
      /Browser Mode API access requires/
    )
    // The Node component supplies only Window aliases for the unchanged Browser
    // fixture. Actual collector, assertion utilities and Browser scopes are real.
    for (const key of aliases.keys())
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: globalThis,
      })
    console.log = (...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].startsWith('STUB_BROWSER_ROW ')
      )
        rows.push(JSON.parse(args[0].slice('STUB_BROWSER_ROW '.length)))
      log(...args)
    }
    await file.collect(async () => {
      const context = getOriginatingCollection()
      assert.ok(context)
      collectionScope = createAsyncScope(
        { kind: 'collection', context },
        (error) => late.push(error)
      )
      collectionScope.run(() => {
        retained = browser.vi.stubGlobal
        assert.equal(retained, browser.vi.stubGlobal)
        assert.equal(browser.vi.fn, common.vi.fn)
        assert.equal(Reflect.get(browser.vi, 'then'), undefined)
        assert.equal(typeof browser.vi.stubEnv, 'function')
        assert.equal(browser.vi.stubEnv, browser.vi.stubEnv)
        assert.throws(() => retained!('Infinity', 19), TypeError)
        const register = (name: string, body: () => void) =>
          browser.test(name, () => {
            const attempt = getActiveAttempt()
            assert.ok(attempt)
            const scope = createAsyncScope(
              { kind: 'attempt', context: attempt },
              (error) => late.push(error)
            )
            try {
              return scope.run(body)
            } finally {
              scope.close()
            }
          })
        // Only the import is supplied by this component adapter; every original
        // fixture operation and assertion body remains byte-for-byte literal.
        const source = require('node:fs').readFileSync(
          join(__dirname, 'browser-vi-contract.mjs.txt'),
          'utf8'
        ) as string
        const [imports, ...body] = source.split('\n')
        assert.equal(
          imports,
          "import { expect, test, vi, vitest } from 'vitest'"
        )
        runInThisContext(
          `(function(expect, test, vi, vitest) {\n${body.join('\n')}\n})`,
          { filename: 'browser-vi-contract.mjs.txt' }
        )(browser.expect, register, browser.vi, browser.vitest)
      })
    })
    collectionScope?.close()
    const result = await file.run({
      runId: 'browser-vi',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => ({ name: entry.name, status: entry.status })),
      [
        'Browser global stubs preserve aliases, descriptors and fluent identity',
        'Browser bulk mock calls return the public vi for further chains',
        'Browser global stubs last until explicit restoration across cases',
      ].map((name) => ({ name, status: 'passed' }))
    )
    assert.deepEqual(result.errors, [])
    const pristine = JSON.parse(
      await readFile(join(__dirname, 'browser-vi-pristine.json'), 'utf8')
    )
    log(
      JSON.stringify({
        actualBrowserViRows: rows,
        completePristineBrowserRows: pristine,
      })
    )
    assert.deepEqual(rows, pristine)
    assert.deepEqual(late, [])
    assert.throws(
      () => retained!('__NEXT_BROWSER_VI_OUTSIDE__', 1),
      /Browser Mode API access requires/
    )
    assert.equal(
      Object.hasOwn(globalThis, '__NEXT_BROWSER_VI_OUTSIDE__'),
      false
    )
    assert.equal(late.length, 1)
  } finally {
    console.log = log
    try {
      await file.dispose()
    } finally {
      collectionScope?.close()
      for (const [key, descriptor] of aliases) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
      await rm(directory, { recursive: true, force: true })
    }
  }
  const payload = {}
  assert.equal(browser.vi.mocked(payload), payload)
  assert.throws(
    () => retained!('__NEXT_BROWSER_VI_CLOSED__', 1),
    /Browser Mode API access requires/
  )
  assert.equal(Object.hasOwn(globalThis, '__NEXT_BROWSER_VI_CLOSED__'), false)
})
