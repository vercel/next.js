'use strict'
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = provider('jsdom')
const dom = new JSDOM('<!DOCTYPE html><body></body>')
for (const name of [
  'document',
  'window',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Node',
  'Document',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLFormElement',
  'HTMLIFrameElement',
  'ShadowRoot',
  'XPathResult',
  'NodeFilter',
])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'window' ? dom.window : dom.window[name],
  })
const scopes = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const mode = process.argv[2],
  late = [],
  commands = []
const task = { type: 'test', id: 'file/0', onFinished: [] }
const collection = scopes.createAsyncScope(
  { kind: 'collection', context: { id: 'file', name: 'file' } },
  (error) => late.push(error)
)
const hook = collection.run(() =>
  scopes.createAsyncScope(
    { kind: 'hook', context: { id: 'hook', suiteId: 'file', name: 'hook' } },
    (error) => late.push(error)
  )
)
const leave = scopes.enterCreatorScope(
  hook.run(() => scopes.captureCreatorScope())
)
let left = false
const binding = api.initializeBrowserContext(
  (command) => {
    commands.push(command)
    return Promise.resolve()
  },
  {
    getConsoleTask() {
      return task
    },
  },
  mode === 'legacy' ? undefined : { serializedClickTargets: true }
)
function populate() {
  document.body.innerHTML =
    '<section id="owned"><ul><li id="red">Red <span data-testid="needle">marker</span><button>Choose</button></li><li id="blue">Blue<button>Choose</button></li><li id="green">Green<button>Choose</button></li></ul></section><p id="decoy">outside decoy</p>'
}
const ids = (locator) => locator.elements().map((element) => element.id)
async function run() {
  try {
    populate()
    const base = api.page.getByRole('listitem'),
      method = base.filter
    if (mode === 'queries') {
      for (const [options, expected] of [
        [{ hasText: 'RED' }, ['red']],
        [{ hasText: /blue/i }, ['blue']],
        [{ hasNotText: /red|blue/i }, ['green']],
        [{ has: api.page.getByTestId('needle') }, ['red']],
        [{ hasNot: api.page.getByTestId('needle') }, ['blue', 'green']],
        [
          {
            hasText: 'red',
            hasNotText: 'blue',
            has: api.page.getByTestId('needle'),
            hasNot: api.page.getByText('absent'),
          },
          ['red'],
        ],
      ])
        assert.deepEqual(ids(base.filter(options)), expected)
      const options = { hasText: 'red' },
        value = base.filter(options)
      options.hasText = 'green'
      assert.deepEqual(ids(value), ['red'])
      document.getElementById('red').firstChild.textContent = 'Other '
      document.getElementById('blue').firstChild.textContent = 'Red '
      assert.deepEqual(ids(value), ['blue'])
    } else if (mode === 'query-cache') {
      const trace = []
      Object.defineProperty(base, 'selector', {
        get() {
          trace.push('parent')
          return 'internal:role=listitem'
        },
      })
      const value = base.filter({ hasText: 'red' })
      assert.deepEqual(trace, ['parent'])
      let text = 'internal:role=listitem >> internal:has-text="Blue"i'
      Object.defineProperty(value, '_pwSelector', {
        get() {
          trace.push('pw')
          return ''
        },
      })
      Object.defineProperty(value, 'selector', {
        get() {
          trace.push('selector')
          return text
        },
      })
      assert.deepEqual(ids(value), ['blue'])
      text = 'internal:role=listitem >> internal:has-text="Green"i'
      assert.deepEqual(ids(value), ['blue'])
      assert.equal(value.query().id, 'blue')
      assert.deepEqual(trace, ['parent', 'pw', 'selector'])
    } else if (mode === 'scoped') {
      const root = document.getElementById('owned')
      const value = api.page
        .elementLocator(root)
        .getByRole('listitem')
        .filter({ hasText: 'red' })
      assert.match(
        value.selector,
        /#owned >> internal:role=listitem >> internal:has-text=/
      )
      assert.deepEqual(ids(value), ['red'])
      assert.throws(
        () =>
          api.page
            .elementLocator(root)
            .getByRole('listitem')
            .filter({ hasText: 'absent' })
            .element(),
        (error) => {
          assert.equal(error.name, 'VitestBrowserElementError')
          assert.equal(error.message.includes('outside decoy'), false)
          assert.equal(error.message.includes('marker'), true)
          return true
        }
      )
      root.remove()
      assert.deepEqual(ids(value), [])
      document.body.insertAdjacentHTML(
        'afterbegin',
        '<section id="owned"><li id="replacement">Red</li></section>'
      )
      assert.deepEqual(ids(value), ['replacement'])
    } else if (mode === 'delegate') {
      const trace = [],
        sentinel = {}
      const nested = Object.defineProperties(
        {},
        {
          _pwSelector: {
            get() {
              trace.push('pw')
              return ''
            },
          },
          selector: {
            get() {
              trace.push('selector')
              return 'internal:text="needle"i'
            },
          },
        }
      )
      const options = Object.defineProperties(
        {},
        {
          hasText: {
            get() {
              trace.push('hasText')
              return 'red'
            },
          },
          hasNotText: {
            get() {
              trace.push('hasNotText')
              return /blue/i
            },
          },
          has: {
            get() {
              trace.push('has')
              return nested
            },
          },
          hasNot: {
            get() {
              trace.push('hasNot')
              return undefined
            },
          },
        }
      )
      const receiver = Object.defineProperty({}, 'locator', {
        get() {
          trace.push('locator:get')
          return function (selector) {
            assert.equal(this, receiver)
            assert.equal(arguments.length, 1)
            assert.equal(
              selector,
              'internal:has-text="red"i >> internal:has-not-text=/blue/i >> internal:has="internal:text=\\"needle\\"i"'
            )
            trace.push('locator:call')
            return sentinel
          }
        },
      })
      assert.equal(Reflect.apply(method, receiver, [options]), sentinel)
      assert.deepEqual(trace, [
        'hasText',
        'hasText',
        'hasNotText',
        'hasNotText',
        'has',
        'has',
        'pw',
        'selector',
        'hasNot',
        'locator:get',
        'locator:call',
      ])
    } else if (mode === 'errors') {
      let reads = 0
      const receiver = Object.defineProperty({}, 'locator', {
        get() {
          reads++
          throw Error('unused')
        },
      })
      for (const value of [
        undefined,
        null,
        {},
        { hasText: '', hasNotText: false, has: null },
      ])
        assert.throws(() => Reflect.apply(method, receiver, [value]), {
          name: 'Error',
          message: 'Locator.filter expects at least one filter. None provided.',
        })
      assert.equal(reads, 0)
      for (const failure of [undefined, new Error('actual getter')]) {
        let caught = false
        try {
          method.call(
            receiver,
            Object.defineProperty({}, 'hasText', {
              get() {
                throw failure
              },
            })
          )
        } catch (error) {
          caught = true
          assert.equal(error, failure)
        }
        assert.equal(caught, true)
      }
      const failure = new Error('actual locator getter')
      assert.throws(
        () =>
          method.call(
            Object.defineProperty({}, 'locator', {
              get() {
                throw failure
              },
            }),
            { hasText: 'red' }
          ),
        (error) => error === failure
      )
    } else if (mode === 'descriptor') {
      assert.equal(Object.hasOwn(base, 'filter'), false)
      assert.equal(method.name, 'filter')
      assert.equal(method.length, 1)
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(base),
        'filter'
      )
      assert.deepEqual(
        {
          enumerable: descriptor.enumerable,
          writable: descriptor.writable,
          configurable: descriptor.configurable,
        },
        { enumerable: false, writable: true, configurable: true }
      )
      const value = base.filter({ hasText: 'red' }),
        first = value.serialize()
      assert.equal(
        value.selector,
        'internal:role=listitem >> internal:has-text="red"i'
      )
      assert.equal(
        value.asLocator(),
        "getByRole('listitem').filter({ hasText: 'red' })"
      )
      assert.deepEqual(Object.keys(first), [
        'selector',
        'locator',
        '_pwSelector',
      ])
      assert.notEqual(first, value.serialize())
      assert.deepEqual(first, value.toJSON())
    } else if (mode === 'serialized' || mode === 'legacy' || mode === 'late') {
      const value = base.filter({ hasText: 'red' }).getByRole('button')
      if (mode === 'legacy')
        Object.defineProperty(value, 'serialize', {
          get() {
            throw Error('unused legacy serialization')
          },
        })
      const action = value.click()
      if (mode === 'late') {
        leave()
        left = true
        hook.close()
        let failure
        await assert.rejects(action, (error) => {
          failure = error
          return /closed|scope|active|outside/i.test(error.message)
        })
        assert.equal(commands.length, 0)
        assert.deepEqual(late, [failure])
      } else {
        await action
        assert.equal(commands.length, 1)
        assert.equal(commands[0].method, 'click')
        if (mode === 'legacy') {
          assert.equal(
            commands[0].element,
            document
              .querySelector('#red button')
              .getAttribute('data-next-test-element')
          )
          assert.equal(Object.hasOwn(commands[0], 'locator'), false)
        } else {
          assert.equal(
            commands[0].locator.selector,
            'internal:role=listitem >> internal:has-text="red"i >> internal:role=button'
          )
          assert.equal(Object.hasOwn(commands[0], 'element'), false)
        }
      }
    } else if (mode === 'strict') {
      assert.throws(
        () => base.filter({ hasText: /./ }).query(),
        /strict mode violation/
      )
      assert.deepEqual(ids(base.filter({ hasText: 'red' })), ['red'])
    } else throw Error('Unknown mode')
    for (const finish of task.onFinished) finish()
    if (mode !== 'late') assert.deepEqual(late, [])
    process.stdout.write(
      JSON.stringify({
        mode,
        actualPinnedQuery: true,
        eagerParentAndLazyCache: true,
        dynamicDelegationAndErrors: true,
        ownedLegacyAndSerializedTargets: true,
      }) + '\n'
    )
  } finally {
    binding.dispose()
    if (!left) leave()
    hook.close()
    collection.close()
    dom.window.close()
  }
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
