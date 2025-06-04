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
  if (process.env.NODE_ENV !== 'development') {
    require('fail')
    import('fail')
  }
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
