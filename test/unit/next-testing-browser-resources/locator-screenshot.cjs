'use strict'
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const load = process.argv[3] ? createRequire(process.argv[3]) : require

const scopes = load('next/dist/experimental/testing/client/async-context')
const api = load('next/dist/experimental/testing/client/browser-context')
const { getBrowserActionThen } = load(
  'next/dist/experimental/testing/client/browser-action-identity'
)
const mode = process.argv[2]
assert(
  [
    'locator',
    'body',
    'element',
    'page-null',
    'page-number',
    'locator-null',
    'locator-number',
    'getters',
    'lazy-target',
    'mask-null',
    'delegate',
    'delegate-getter',
    'original-error',
    'native-error',
    'repeat',
    'unawaited',
    'concurrent',
    'outside',
    'once',
    'mask',
  ].includes(mode)
)
const { createDOMFixture, locatorGlobals } = require('./dom-fixture.cjs')
const { dom, restoreGlobals } = createDOMFixture({
  html: '<!DOCTYPE html><body><div id="actual" data-testid="actual"></div></body>',
  globals: locatorGlobals,
  load,
  saveGlobals: 'during',
})
const late = [],
  commands = [],
  trace = [],
  marker = new Error('original screenshot failure'),
  reply = { path: '/native/screenshot.png', base64: 'AP8RQg==' },
  task = {
    type: 'test',
    id: 'file/0',
    name: 'case / name',
    suite: { name: 'outer suite' },
    result: { repeatCount: 0 },
    onFinished: [],
  }
let current = task
const scope = scopes.createAsyncScope(
  {
    kind: 'attempt',
    context: { id: 'screen', fileId: 'file', testId: 'case' },
  },
  (error) => late.push(error)
)
const leave = scopes.enterCreatorScope(
  scope.run(() => scopes.captureCreatorScope())
)
const binding = api.initializeBrowserContext(
  async (command, _origin, errorSource) => {
    assert(errorSource instanceof Error)
    commands.push(command)
    if (mode === 'native-error') throw marker
    return reply
  },
  { getConsoleTask: () => current },
  { serializedClickTargets: true }
)
const locator = api.page.getByTestId('actual'),
  descriptor = { selector: '#captured', locator: "locator('#captured')" },
  element = document.getElementById('actual')
Object.defineProperty(locator, 'serialize', {
  configurable: true,
  get() {
    trace.push('serialize:get')
    if (mode === 'original-error') throw marker
    return function () {
      assert.equal(this, locator)
      assert.equal(arguments.length, 0)
      trace.push('serialize:call')
      return descriptor
    }
  },
})
const screenshotDescriptor = Object.getOwnPropertyDescriptor(
  api.page,
  'screenshot'
)
const expectedName = (number) => `outer-suite-case---name-${number}.png`
async function finish(action) {
  assert.equal(Object.prototype.toString.call(action), '[object Action]')
  assert.equal(getBrowserActionThen(action), action.then)
  return action
}
async function main() {
  try {
    if (mode === 'delegate' || mode === 'delegate-getter') {
      const options = {
        get path() {
          trace.push('path')
          return 'shots/a.png'
        },
      }
      Object.defineProperty(api.page, 'screenshot', {
        configurable: true,
        get() {
          trace.push('page:get')
          if (mode === 'delegate-getter') throw marker
          return function (value) {
            assert.equal(this, api.page)
            assert.equal(arguments.length, 1)
            assert.equal(value.element, locator)
            assert.equal(value.path, 'shots/a.png')
            return reply
          }
        },
      })
      if (mode === 'delegate-getter') {
        assert.throws(
          () => locator.screenshot(options),
          (e) => e === marker
        )
        assert.deepEqual(trace, ['page:get'])
      } else {
        assert.equal(locator.screenshot(options), reply)
        assert.deepEqual(trace, ['page:get', 'path'])
      }
      assert.equal(task.onFinished.length, 0)
    } else if (mode === 'outside' || mode === 'concurrent') {
      if (mode === 'outside') current = undefined
      else task.concurrent = true
      assert.throws(
        () =>
          api.page.screenshot({
            get path() {
              throw marker
            },
          }),
        mode === 'outside'
          ? /Cannot take a screenshot outside of a test\./
          : /Cannot take a screenshot in a concurrent test because concurrent tests run at the same time in the same iframe and affect each other's environment\. Use a non-concurrent test to take a screenshot\./
      )
      assert.equal(task.onFinished.length, 0)
      assert.equal(commands.length, 0)
    } else if (
      mode === 'page-null' ||
      mode === 'page-number' ||
      mode === 'mask-null'
    ) {
      let caught
      if (mode === 'page-null') {
        try {
          api.page.screenshot(null)
        } catch (error) {
          caught = error
        }
        assert(caught instanceof TypeError)
        assert.equal(task.onFinished.length, 0)
      } else {
        const action = api.page.screenshot(
          mode === 'page-number'
            ? 17
            : { element: locator, path: 'shots/bad.png', mask: null }
        )
        assert.equal(commands.length, 0)
        try {
          await finish(action)
        } catch (error) {
          caught = error
        }
        assert(caught instanceof TypeError)
      }
      const value = await api.page.screenshot({ element: locator })
      assert.equal(value, reply)
      assert.equal(commands.length, 1)
      assert.equal(commands[0].args[0], expectedName(2))
    } else if (mode === 'repeat') {
      const actions = [locator.screenshot()]
      task.result.repeatCount = 1
      actions.push(locator.screenshot())
      task.result.repeatCount = 0
      actions.push(locator.screenshot())
      await Promise.all(actions.map(finish))
      assert.deepEqual(
        commands.map((x) => x.args[0]),
        [expectedName(1), expectedName(1), expectedName(2)]
      )
    } else {
      let action
      if (mode === 'getters') {
        let paths = 0
        const options = {
          get path() {
            trace.push('path')
            return ++paths === 1 ? 'shots/first.png' : 'shots/later.png'
          },
          get element() {
            trace.push('element')
            return locator
          },
          get base64() {
            trace.push('base64')
            return true
          },
        }
        action = api.page.screenshot(options)
        assert.deepEqual(trace, ['path'])
      } else if (mode === 'body')
        action = api.page.screenshot({ path: 'shots/body.png', base64: true })
      else if (mode === 'element')
        action = api.page.screenshot({ element, path: 'shots/element.png' })
      else if (mode === 'locator-null') action = locator.screenshot(null)
      else if (mode === 'locator-number') action = locator.screenshot(17)
      else if (mode === 'mask')
        action = locator.screenshot({ path: 'shots/mask.png', mask: [element] })
      else action = locator.screenshot({ path: 'shots/a.png', base64: true })
      assert.equal(Object.prototype.toString.call(action), '[object Action]')
      assert.equal(getBrowserActionThen(action), action.then)
      assert.equal(commands.length, 0)
      if (mode !== 'getters') assert.deepEqual(trace, [])
      if (mode === 'unawaited') {
        assert.throws(task.onFinished[0], /was not awaited/)
        assert.equal(commands.length, 0)
      } else {
        if (mode === 'lazy-target') {
          Object.defineProperty(locator, 'serialize', {
            value() {
              trace.push('replacement')
              return descriptor
            },
          })
        }
        if (mode === 'original-error' || mode === 'native-error')
          await assert.rejects(action, (e) => e === marker)
        else if (mode === 'once') {
          const values = await Promise.all([
            action.then((v) => v),
            action.then((v) => v),
          ])
          assert.equal(values[0], reply)
          assert.equal(values[1], reply)
        } else assert.equal(await finish(action), reply)
        assert.equal(commands.length, mode === 'original-error' ? 0 : 1)
        if (commands.length) {
          const command = commands[0]
          assert.equal(command.method, 'screenshot')
          assert.equal('element' in command, false)
          if (mode === 'body')
            assert.deepEqual(command.locator, {
              selector: 'body',
              locator: "locator('body')",
            })
          else if (mode === 'element')
            assert.equal(command.locator.selector, 'html > body > #actual')
          else {
            assert.equal(command.locator, descriptor)
            assert.equal('element' in command.args[1], false)
          }
          if (mode === 'locator-null' || mode === 'locator-number')
            assert.equal(command.args[0], expectedName(1))
          if (mode === 'getters') {
            assert.equal(command.args[0], 'shots/first.png')
            assert.equal(command.args[1].path, 'shots/later.png')
            assert.deepEqual(trace, [
              'path',
              'path',
              'element',
              'base64',
              'element',
              'element',
              'serialize:get',
              'serialize:call',
            ])
          }
          if (mode === 'lazy-target') assert.deepEqual(trace, ['replacement'])
          if (mode === 'mask') {
            assert.deepEqual(command.args[1].mask, [
              {
                selector: 'html > body > #actual',
                locator: "getByTestId('actual')",
              },
            ])
          }
        }
      }
    }
    if (mode !== 'unawaited') for (const callback of task.onFinished) callback()
    assert.deepEqual(late, [])
    console.log(
      JSON.stringify({
        mode,
        actualScreenshotActionAndLazySerialization: true,
        pageDelegationAndOriginalErrors: true,
        pinnedOptionAndCounterEffects: true,
        existingScopeAndThenIdentity: true,
      })
    )
  } finally {
    Object.defineProperty(api.page, 'screenshot', screenshotDescriptor)
    binding.dispose()
    scope.close()
    leave()
    dom.window.close()
    restoreGlobals()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
