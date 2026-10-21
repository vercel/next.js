const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const {
  openTestEnvironment,
} = require('next/dist/experimental/testing/environments/runtime')

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'next-dom-window-provider-'))
  const provider = join(root, 'node_modules/jsdom')
  mkdirSync(provider, { recursive: true })
  writeFileSync(
    join(provider, 'package.json'),
    '{"name":"jsdom","main":"index.cjs"}'
  )
  writeFileSync(
    join(provider, 'index.cjs'),
    `
    const actual = require(${JSON.stringify(require('node:module').createRequire(require.resolve('jest-environment-jsdom')).resolve('jsdom'))});
    const hidden = new Set(['addEventListener','removeEventListener','dispatchEvent']);
    exports.JSDOM = class extends actual.JSDOM {
      constructor(...args) {
        super(...args);
        const win = this.window;
        Object.defineProperty(win, 'deferredWindowValue', {configurable:true,get(){throw new Error('deferred provider getter')}});
        const proxy = new Proxy(win, {
          ownKeys: target => Reflect.ownKeys(target).filter(key => !hidden.has(key)),
          getOwnPropertyDescriptor: (target,key) => hidden.has(key) ? undefined : Reflect.getOwnPropertyDescriptor(target,key),
          getPrototypeOf: () => null,
          get: (target,key) => Reflect.get(target,key,target),
        });
        Object.defineProperty(this, 'window', {value:proxy});
      }
    };
  `
  )
  let hostReads = 0
  const hostGetter = () => {
    hostReads++
    throw new Error('host getter must stay lazy')
  }
  Object.defineProperty(globalThis, 'deferredHostValue', {
    configurable: true,
    get: hostGetter,
  })
  const before = new Map(
    Reflect.ownKeys(globalThis).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  try {
    const owned = await openTestEnvironment(root, { name: 'jsdom' })
    try {
      assert.equal(hostReads, 0)
      assert.throws(
        () => globalThis.deferredWindowValue,
        /deferred provider getter/
      )
      const add = globalThis.addEventListener
      const remove = globalThis.removeEventListener
      const dispatch = globalThis.dispatchEvent
      assert.equal(add, globalThis.addEventListener)
      assert.equal(remove, globalThis.removeEventListener)
      assert.equal(dispatch, globalThis.dispatchEvent)
      let calls = 0
      const event = new Event('owned-dom-event', { cancelable: true })
      const listener = (received) => {
        assert.equal(received, event)
        calls++
        received.preventDefault()
      }
      add('owned-dom-event', listener)
      assert.equal(dispatch(event), false)
      remove('owned-dom-event', listener)
      dispatch(new Event('owned-dom-event'))
      assert.equal(calls, 1)
      assert.equal(
        Object.getOwnPropertyDescriptor(globalThis, 'matchMedia').configurable,
        true
      )
      assert.equal(globalThis.matchMedia, undefined)
      const authored = () => ({ matches: true })
      globalThis.matchMedia = authored
      assert.equal(globalThis.matchMedia, authored)
      assert.equal(jsdom.window.matchMedia, authored)
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: authored,
      })
      assert.equal(
        Object.getOwnPropertyDescriptor(window, 'matchMedia').configurable,
        true
      )
      assert.equal(window.matchMedia, authored)
    } finally {
      await owned.dispose()
    }
    assert.equal(hostReads, 0)
    assert.equal(
      Object.getOwnPropertyDescriptor(globalThis, 'deferredHostValue').get,
      hostGetter
    )
    assert(!('matchMedia' in globalThis))
    assert(!('deferredWindowValue' in globalThis))
    for (const [key, descriptor] of before)
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, key),
        descriptor
      )
    process.stdout.write(
      JSON.stringify({
        proxyHiddenMethods: true,
        stableBoundIdentity: true,
        nativeEventIdentity: true,
        removal: true,
        configurablePlaceholder: true,
        authoredOverrideAndPropagation: true,
        lazyGetters: true,
        restored: true,
      }) + '\n'
    )
  } finally {
    Reflect.deleteProperty(globalThis, 'deferredHostValue')
    rmSync(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
