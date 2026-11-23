it('importing a not existing file should throw', () => {
  // This is a check to make sure that the following tests would fail if they require("fail")
  expect(() => {
    require('./not-existing-file')
  }).toThrow()
})

function maybeReturn(x) {
  if (x) {
    return true
  }
}

function func() {
  if (false) {
    require('fail')
    import('fail')
  }
  if (true) {
    require('./ok')
  }
  if (true) {
    require('./ok')
  } else {
    require('fail')
    import('fail')
  }
  if (false) {
    require('fail')
    import('fail')
  } else {
    require('./ok')
  }
}

it('should not follow conditional references', () => {
  func()

  expect(func.toString()).not.toContain('import(')
})

function funcTenary() {
  false ? require('fail') : undefined
  false ? import('fail') : undefined
  true ? require('./ok') : undefined
  true ? require('./ok') : require('fail')
  true ? require('./ok') : (require('fail'), import('fail'))
  true
    ? require('./ok')
    : (() => {
        require('fail')
        import('fail')
      })()
  const value = false
    ? (() => {
        require('fail')
        import('fail')
      })()
    : require('./ok')
}

it('should not follow conditional tenary references', () => {
  funcTenary()

  expect(funcTenary.toString()).not.toContain('import(')
})

it('should allow to mutate objects', () => {
  const obj = { a: true, b: false }
  if (!obj.a) {
    throw new Error('should not be executed')
  }
  if (obj.b) {
    throw new Error('should not be executed')
  }
  function changeIt(o) {
    o.a = false
    o.b = true
  }
  changeIt(obj)
  if (obj.a) {
    throw new Error('should not be executed')
  }
  if (!obj.b) {
    throw new Error('should not be executed')
  }
})

it('should allow replacements in IIFEs', () => {
  ;(function func() {
    if (false) {
      require('fail')
      import('fail')
    }
  })()
})

it('should support functions that only sometimes return', () => {
  let ok = false
  if (maybeReturn(true)) {
    ok = true
  }
  expect(ok).toBe(true)
})

it('should evaluate process.turbopack', () => {
  let ok = false
  if (process.turbopack) {
    ok = true
  } else {
    require('fail')
    import('fail')
  }
  expect(ok).toBe(true)
})

it('should evaluate !process.turbopack', () => {
  if (!process.turbopack) {
    require('fail')
    import('fail')
  }
})

it('should evaluate NODE_ENV', () => {
  if (process.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
})

it('should evaluate NODE_ENV through globalThis and global', () => {
  if (globalThis.process.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  if (global.process.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  var p = globalThis.process
  if (p.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
})

it('should not evaluate globalThis members used for feature detection', () => {
  // These globals don't exist in Node.js, so the fallback branch must be kept
  expect(globalThis.Worker ? 'yes' : 'no').toBe(
    typeof Worker === 'undefined' ? 'no' : 'yes'
  )
  expect(global.SharedWorker ? 'yes' : 'no').toBe(
    typeof SharedWorker === 'undefined' ? 'no' : 'yes'
  )
  let processExists = false
  if (globalThis.process) {
    processExists = true
  }
  expect(processExists).toBe(typeof process !== 'undefined')
})

// Temporarily replaces a property of the global object, so that the checks
// below observe a value that only exists at runtime.
function withGlobal(name, value, fn) {
  const descriptor = Reflect.getOwnPropertyDescriptor(globalThis, name)
  Reflect.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
  try {
    return fn()
  } finally {
    if (descriptor) {
      Reflect.defineProperty(globalThis, name, descriptor)
    } else {
      Reflect.deleteProperty(globalThis, name)
    }
  }
}

it('should keep existence checks of well-known globals as runtime checks', () => {
  // Each entry evaluates `if (globalThis.X)`, `globalThis.X ? … : …`,
  // `typeof X` and `typeof globalThis.X` for one well-known global X. The
  // expressions must be written out literally, as that is what the static
  // analyzer sees.
  const checks = {
    process: () => {
      let exists = false
      if (globalThis.process) {
        exists = true
      }
      return [
        exists,
        globalThis.process ? 'yes' : 'no',
        typeof process,
        typeof globalThis.process,
      ]
    },
    Object: () => {
      let exists = false
      if (globalThis.Object) {
        exists = true
      }
      return [
        exists,
        globalThis.Object ? 'yes' : 'no',
        typeof Object,
        typeof globalThis.Object,
      ]
    },
    Buffer: () => {
      let exists = false
      if (globalThis.Buffer) {
        exists = true
      }
      return [
        exists,
        globalThis.Buffer ? 'yes' : 'no',
        typeof Buffer,
        typeof globalThis.Buffer,
      ]
    },
    navigator: () => {
      let exists = false
      if (globalThis.navigator) {
        exists = true
      }
      return [
        exists,
        globalThis.navigator ? 'yes' : 'no',
        typeof navigator,
        typeof globalThis.navigator,
      ]
    },
    URL: () => {
      let exists = false
      if (globalThis.URL) {
        exists = true
      }
      return [
        exists,
        globalThis.URL ? 'yes' : 'no',
        typeof URL,
        typeof globalThis.URL,
      ]
    },
    Worker: () => {
      let exists = false
      if (globalThis.Worker) {
        exists = true
      }
      return [
        exists,
        globalThis.Worker ? 'yes' : 'no',
        typeof Worker,
        typeof globalThis.Worker,
      ]
    },
    SharedWorker: () => {
      let exists = false
      if (globalThis.SharedWorker) {
        exists = true
      }
      return [
        exists,
        globalThis.SharedWorker ? 'yes' : 'no',
        typeof SharedWorker,
        typeof globalThis.SharedWorker,
      ]
    },
  }

  for (const [name, check] of Object.entries(checks)) {
    const missing = withGlobal(name, undefined, check)
    const present = withGlobal(name, function stub() {}, check)
    expect({ name, missing, present }).toEqual({
      name,
      missing: [false, 'no', 'undefined', 'undefined'],
      present: [true, 'yes', 'function', 'function'],
    })
  }
})

it('should evaluate process.turbopack through globalThis and global', () => {
  if (!globalThis.process.turbopack) {
    require('fail')
    import('fail')
  }
  if (!global.process.turbopack) {
    require('fail')
    import('fail')
  }
})

import importedProcess from 'process'
import * as processNamespace from 'process'
import nodeProcess from 'node:process'
import * as nodeProcessNamespace from 'node:process'

it('should evaluate NODE_ENV through process imports', () => {
  if (importedProcess.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  if (processNamespace.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  if (processNamespace.default.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  if (nodeProcess.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  if (nodeProcessNamespace.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  if (nodeProcessNamespace.default.env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }

  if (require('process').env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
  if (require('node:process').env.NODE_ENV !== 'production') {
    require('fail')
    import('fail')
  }
})

it('should not treat the process object as a module namespace', () => {
  expect(() => process.default.env.NODE_ENV).toThrow(TypeError)
  expect(() => importedProcess.default.env.NODE_ENV).toThrow(TypeError)
  expect(() => nodeProcess.default.env.NODE_ENV).toThrow(TypeError)
  expect(() => processNamespace.default.default.env.NODE_ENV).toThrow(TypeError)
  expect(() => nodeProcessNamespace.default.default.env.NODE_ENV).toThrow(
    TypeError
  )
})

it('should keep side-effects in if statements', () => {
  {
    let ok = false
    let ok2 = true
    if (((ok = true), false)) {
      ok2 = false
      // TODO improve static analysis to detect that this is unreachable
      // require("fail");
    }
    expect(ok).toBe(true)
    expect(ok2).toBe(true)
  }
  {
    let ok = false
    let ok2 = false
    let ok3 = true
    if (((ok = true), true)) {
      ok2 = true
    } else {
      ok3 = false
      // TODO improve static analysis to detect that this is unreachable
      // require("fail");
    }
    expect(ok).toBe(true)
    expect(ok2).toBe(true)
    expect(ok3).toBe(true)
  }
  {
    let ok = 0
    if ((ok++, true)) {
      ok++
    } else {
      // TODO improve static analysis to detect that this is unreachable
      // require("fail");
    }
    expect(ok).toBe(2)
  }
})

it('should analyze numeric additions', () => {
  if (1 + 2 !== 3) {
    require('fail')
  }
})

it('should consider side-effects of conditions', () => {
  let sideEffects = 0
  function sideEffectFalse(value) {
    sideEffects += value
    return false
  }

  function calculate() {
    var state = 0
    if (sideEffectFalse((state += 1))) {
      state += 10
      return state
    }
    if (sideEffectFalse(state)) {
      state += 10
      return state
    }
    return state
  }

  expect(calculate()).toBe(1)
  expect(sideEffects).toBe(2)
})
