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

const DELETED = Symbol('deleted')

// Captured up front, as the tests below also replace `globalThis` itself.
const globalObject = globalThis

// Temporarily replaces a property of `target` (or deletes it when `value` is
// `DELETED`), so that the checks below observe a value that only exists at
// runtime.
function withProperty(target, name, value, fn) {
  const descriptor = Reflect.getOwnPropertyDescriptor(target, name)
  if (value === DELETED) {
    Reflect.deleteProperty(target, name)
  } else {
    Reflect.defineProperty(target, name, {
      value,
      configurable: true,
      writable: true,
    })
  }
  try {
    return fn()
  } finally {
    if (descriptor) {
      Reflect.defineProperty(target, name, descriptor)
    } else {
      Reflect.deleteProperty(target, name)
    }
  }
}

function withGlobal(name, value, fn) {
  return withProperty(globalObject, name, value, fn)
}

it('should keep existence checks of well-known globals as runtime checks', () => {
  // Each entry evaluates `if (globalThis.X)`, `globalThis.X ? … : …`,
  // `global.X ? … : …`, `typeof X`, `typeof globalThis.X` and
  // `globalThis.X ?? …` for one well-known global X. The expressions must be
  // written out literally, as that is what the static analyzer sees.
  const checks = {
    process: () => {
      let exists = false
      if (globalThis.process) {
        exists = true
      }
      return [
        exists,
        globalThis.process ? 'yes' : 'no',
        global.process ? 'yes' : 'no',
        typeof process,
        typeof globalThis.process,
        (globalThis.process ?? 'fallback') === 'fallback',
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
        global.Object ? 'yes' : 'no',
        typeof Object,
        typeof globalThis.Object,
        (globalThis.Object ?? 'fallback') === 'fallback',
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
        global.Buffer ? 'yes' : 'no',
        typeof Buffer,
        typeof globalThis.Buffer,
        (globalThis.Buffer ?? 'fallback') === 'fallback',
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
        global.navigator ? 'yes' : 'no',
        typeof navigator,
        typeof globalThis.navigator,
        (globalThis.navigator ?? 'fallback') === 'fallback',
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
        global.URL ? 'yes' : 'no',
        typeof URL,
        typeof globalThis.URL,
        (globalThis.URL ?? 'fallback') === 'fallback',
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
        global.Worker ? 'yes' : 'no',
        typeof Worker,
        typeof globalThis.Worker,
        (globalThis.Worker ?? 'fallback') === 'fallback',
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
        global.SharedWorker ? 'yes' : 'no',
        typeof SharedWorker,
        typeof globalThis.SharedWorker,
        (globalThis.SharedWorker ?? 'fallback') === 'fallback',
      ]
    },
  }

  // The same checks on the bare identifier X. When X doesn't exist at all,
  // these must throw a ReferenceError instead of being folded away.
  const bareChecks = {
    process: () => {
      let exists = false
      if (process) {
        exists = true
      }
      return [
        exists,
        process ? 'yes' : 'no',
        (process ?? 'fallback') === 'fallback',
      ]
    },
    Object: () => {
      let exists = false
      if (Object) {
        exists = true
      }
      return [
        exists,
        Object ? 'yes' : 'no',
        (Object ?? 'fallback') === 'fallback',
      ]
    },
    Buffer: () => {
      let exists = false
      if (Buffer) {
        exists = true
      }
      return [
        exists,
        Buffer ? 'yes' : 'no',
        (Buffer ?? 'fallback') === 'fallback',
      ]
    },
    navigator: () => {
      let exists = false
      if (navigator) {
        exists = true
      }
      return [
        exists,
        navigator ? 'yes' : 'no',
        (navigator ?? 'fallback') === 'fallback',
      ]
    },
    URL: () => {
      let exists = false
      if (URL) {
        exists = true
      }
      return [exists, URL ? 'yes' : 'no', (URL ?? 'fallback') === 'fallback']
    },
    Worker: () => {
      let exists = false
      if (Worker) {
        exists = true
      }
      return [
        exists,
        Worker ? 'yes' : 'no',
        (Worker ?? 'fallback') === 'fallback',
      ]
    },
    SharedWorker: () => {
      let exists = false
      if (SharedWorker) {
        exists = true
      }
      return [
        exists,
        SharedWorker ? 'yes' : 'no',
        (SharedWorker ?? 'fallback') === 'fallback',
      ]
    },
  }

  const runBare = (bareCheck) => {
    try {
      return bareCheck()
    } catch (e) {
      return e instanceof ReferenceError ? 'ReferenceError' : e
    }
  }

  for (const [name, check] of Object.entries(checks)) {
    const bareCheck = () => runBare(bareChecks[name])
    const results = {}
    for (const [mode, value] of [
      ['missing', undefined],
      ['null', null],
      ['present', function stub() {}],
      ['deleted', DELETED],
    ]) {
      results[mode] = withGlobal(name, value, () => [check(), bareCheck()])
    }
    expect({ name, ...results }).toEqual({
      name,
      missing: [
        [false, 'no', 'no', 'undefined', 'undefined', true],
        [false, 'no', true],
      ],
      null: [
        [false, 'no', 'no', 'object', 'object', true],
        [false, 'no', true],
      ],
      present: [
        [true, 'yes', 'yes', 'function', 'function', false],
        [true, 'yes', false],
      ],
      deleted: [
        [false, 'no', 'no', 'undefined', 'undefined', true],
        'ReferenceError',
      ],
    })
  }
})

it('should keep navigator.serviceWorker existence checks as runtime checks', () => {
  // `navigator` can exist without `serviceWorker` (e.g. in insecure contexts
  // or in Node.js), so these must not be folded at compile time.
  const check = () => {
    let exists = false
    if (navigator.serviceWorker) {
      exists = true
    }
    let globalExists = false
    if (globalThis.navigator.serviceWorker) {
      globalExists = true
    }
    return [
      exists,
      navigator.serviceWorker ? 'yes' : 'no',
      (navigator.serviceWorker ?? 'fallback') === 'fallback',
      'serviceWorker' in navigator,
      globalExists,
      globalThis.navigator.serviceWorker ? 'yes' : 'no',
      (globalThis.navigator.serviceWorker ?? 'fallback') === 'fallback',
      'serviceWorker' in globalThis.navigator,
    ]
  }

  expect({
    missing: withGlobal('navigator', {}, check),
    undefined: withGlobal('navigator', { serviceWorker: undefined }, check),
    present: withGlobal('navigator', { serviceWorker: {} }, check),
  }).toEqual({
    missing: [false, 'no', true, false, false, 'no', true, false],
    undefined: [false, 'no', true, true, false, 'no', true, true],
    present: [true, 'yes', false, true, true, 'yes', false, true],
  })
})

it('should keep globalThis existence checks as runtime checks', () => {
  // `globalThis` doesn't exist in older browsers.
  const check = () => {
    let exists = false
    if (globalThis) {
      exists = true
    }
    return [
      exists,
      globalThis ? 'yes' : 'no',
      (globalThis ?? 'fallback') === 'fallback',
    ]
  }

  expect({
    undefined: withGlobal('globalThis', undefined, check),
    present: withGlobal('globalThis', globalObject, check),
  }).toEqual({
    undefined: [false, 'no', true],
    present: [true, 'yes', false],
  })
})

it('should keep Object.assign existence checks as runtime checks', () => {
  // `Object.assign` doesn't exist in older browsers.
  const check = () => {
    let exists = false
    if (Object.assign) {
      exists = true
    }
    let globalExists = false
    if (globalThis.Object.assign) {
      globalExists = true
    }
    return [
      exists,
      Object.assign ? 'yes' : 'no',
      (Object.assign ?? 'fallback') === 'fallback',
      globalExists,
      globalThis.Object.assign ? 'yes' : 'no',
      (globalThis.Object.assign ?? 'fallback') === 'fallback',
    ]
  }

  const assign = () => {}
  expect({
    undefined: withProperty(Object, 'assign', undefined, check),
    deleted: withProperty(Object, 'assign', DELETED, check),
    present: withProperty(Object, 'assign', assign, check),
  }).toEqual({
    undefined: [false, 'no', true, false, 'no', true],
    deleted: [false, 'no', true, false, 'no', true],
    present: [true, 'yes', false, true, 'yes', false],
  })
})

it('should keep Object.hasOwn existence checks as runtime checks', () => {
  // `Object.hasOwn` doesn't exist in older browsers.
  const check = () => {
    let exists = false
    if (Object.hasOwn) {
      exists = true
    }
    let globalExists = false
    if (globalThis.Object.hasOwn) {
      globalExists = true
    }
    return [
      exists,
      Object.hasOwn ? 'yes' : 'no',
      (Object.hasOwn ?? 'fallback') === 'fallback',
      globalExists,
      globalThis.Object.hasOwn ? 'yes' : 'no',
      (globalThis.Object.hasOwn ?? 'fallback') === 'fallback',
    ]
  }

  const hasOwn = () => {}
  expect({
    undefined: withProperty(Object, 'hasOwn', undefined, check),
    deleted: withProperty(Object, 'hasOwn', DELETED, check),
    present: withProperty(Object, 'hasOwn', hasOwn, check),
  }).toEqual({
    undefined: [false, 'no', true, false, 'no', true],
    deleted: [false, 'no', true, false, 'no', true],
    present: [true, 'yes', false, true, 'yes', false],
  })
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

it('should keep the truthiness of the imported process module', () => {
  // Unlike the global `process`, an imported `process` always exists
  if (!importedProcess) {
    require('fail')
    import('fail')
  }
})

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
