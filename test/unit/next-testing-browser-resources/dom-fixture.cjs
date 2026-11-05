const { createRequire } = require('node:module')

const locatorGlobals = [
  'document',
  'window',
  'Element',
  'Node',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLFormElement',
  'HTMLIFrameElement',
  'ShadowRoot',
  'XPathResult',
]

function createDOMFixture({ html, globals, load, saveGlobals = false }) {
  const provider = createRequire(load.resolve('jest-environment-jsdom'))
  const { JSDOM } = provider('jsdom')
  const dom = new JSDOM(html)
  const saved =
    saveGlobals === 'before'
      ? new Map(
          globals.map((name) => [
            name,
            Object.getOwnPropertyDescriptor(globalThis, name),
          ])
        )
      : saveGlobals === 'during'
        ? new Map()
        : undefined
  for (const name of globals) {
    if (saveGlobals === 'during')
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'window' ? dom.window : dom.window[name],
    })
  }
  return {
    dom,
    restoreGlobals:
      saved &&
      (() => {
        for (const [name, descriptor] of saved) {
          if (descriptor) Object.defineProperty(globalThis, name, descriptor)
          else Reflect.deleteProperty(globalThis, name)
        }
      }),
  }
}

module.exports = { createDOMFixture, locatorGlobals }
