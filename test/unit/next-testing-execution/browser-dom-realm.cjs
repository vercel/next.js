// Test-only DOM globals from this fixture's actual JSDOM window.
module.exports = function installBrowserDomRealm(window) {
  const saved = new Map()
  const set = (name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    if (descriptor && !descriptor.configurable) {
      if (globalThis[name] === value) return
      throw new Error('Cannot install JSDOM realm global ' + name)
    }
    saved.set(name, descriptor)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    })
  }
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    for (const [name, descriptor] of [...saved].reverse()) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
  try {
    for (const name of Object.getOwnPropertyNames(window)) {
      if (
        !/^(?:HTML|SVG|CSS|Element$|Node$|NodeFilter$|Document|ShadowRoot$|Text$|Comment$|Window$)/.test(
          name
        )
      )
        continue
      const value = window[name]
      if (
        typeof value === 'function' ||
        (typeof value === 'object' && value !== null)
      )
        set(name, value)
    }
    set('window', window)
    set('self', window)
    set('getComputedStyle', window.getComputedStyle.bind(window))
    return restore
  } catch (error) {
    restore()
    throw error
  }
}
