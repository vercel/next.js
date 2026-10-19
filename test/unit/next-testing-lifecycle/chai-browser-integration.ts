import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import { getOriginatingCollection } from 'next/dist/experimental/testing/runner/async-context'
import { createAsyncScope } from 'next/dist/experimental/testing/client/async-context'
import {
  chai,
  should,
  assert as chaiAssert,
  expect,
} from 'next/dist/experimental/testing/client/vitest'

it('shares Browser Chai helper identities and raw behavior with the actual pristine Browser dictionaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-browser-facade-'))
  const file = initializeTestFile({
    fileId: 'browser-component',
    filePath: join(directory, 'browser-component.test.ts'),
  })
  const rows: unknown[] = []
  const late: Error[] = []
  let browserScope: ReturnType<typeof createAsyncScope> | undefined
  const previousShould = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'should'
  )
  try {
    await file.collect(async () => {
      const collection = getOriginatingCollection()
      assert.ok(collection)
      // Use the actual current collector context with the real browser admission
      // seam. This is a plain Node component, not a native Browser execution.
      browserScope = createAsyncScope(
        { kind: 'collection', context: collection },
        (error) => late.push(error)
      )
      browserScope.run(() => {
        rows.push({
          label: 'exports',
          value: {
            chai: typeof chai,
            assertSame: chai.assert === chaiAssert,
            shouldSame: chai.should === should,
            capitalShouldSame: chai.Should === should,
            expectAssertSame: expect.assert === chaiAssert,
            rawExpectDifferent: chai.expect !== expect,
          },
        })
        chai.expect(3).to.equal(3)
        chai.assert.equal(3, 3)
        chaiAssert.equal(4, 4)
        rows.push({
          label: 'raw-count',
          value: { calls: expect.getState().assertionCalls },
        })
        const helper = should()
        const second = chai.should()
        const assertion = Reflect.get(Object(42), 'should')
        assertion.equal(42)
        helper.equal(43, 43)
        second.exist('present')
        rows.push({
          label: 'should',
          value: {
            helperObject: typeof helper,
            secondObject: typeof second,
            getter: typeof Object.getOwnPropertyDescriptor(
              Object.prototype,
              'should'
            )!.get,
            calls: expect.getState().assertionCalls,
          },
        })
        const oldUseProxy = chai.config.useProxy
        let pluginCalls = 0
        const plugin: Parameters<typeof chai.use>[0] = (_chai, utils) => {
          _chai.Assertion.addMethod(
            'browserChaiValue',
            function (expected: number) {
              pluginCalls++
              this.assert(
                utils.flag(this, 'object') === expected,
                'expected browser value',
                'expected different browser value',
                expected
              )
            }
          )
        }
        try {
          const first = chai.use(plugin)
          const repeated = chai.use(plugin)
          chai.config.useProxy = true
          const payload = { marker: 7 }
          const enabled = Reflect.apply(chai.util.proxify, chai.util, [payload])
          let typo
          try {
            Reflect.get(enabled, 'mraker')
          } catch (error) {
            const actual = error as Error
            typo = { name: actual.name, message: actual.message }
          }
          Reflect.get(chai.expect(8), 'browserChaiValue')(8)
          chai.config.useProxy = false
          rows.push({
            label: 'proxy-plugin',
            value: {
              freshUseRecords: first !== repeated,
              sharedPluginUtility: first.util === repeated.util,
              enabledDifferent: enabled !== payload,
              enabledValue: enabled.marker,
              disabledSame:
                Reflect.apply(chai.util.proxify, chai.util, [payload]) ===
                payload,
              typo,
              pluginCalls,
              calls: expect.getState().assertionCalls,
            },
          })
        } finally {
          chai.config.useProxy = oldUseProxy
        }
      })
    })
    const pristine = JSON.parse(
      await readFile(join(__dirname, 'chai-browser-pristine.json'), 'utf8')
    )
    console.log(
      JSON.stringify({
        actualBrowserFacadeComponentRows: rows,
        completePristineBrowserRows: pristine,
      })
    )
    assert.deepEqual(rows, pristine)
    assert.deepEqual(late, [])
  } finally {
    try {
      await file.dispose()
    } finally {
      browserScope?.close()
      await rm(directory, { recursive: true, force: true })
    }
  }
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(Object.prototype, 'should'),
    previousShould
  )
  assert.throws(
    () => should(),
    /Browser Mode API access requires its originating/
  )
  assert.throws(
    () => chaiAssert.equal(1, 1),
    /Assertion APIs require an initialized Next test file/
  )
})
