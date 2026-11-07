function withNavigator(value, fn) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  })
  try {
    return fn()
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor)
    } else {
      delete globalThis.navigator
    }
  }
}

function notGuard() {
  if (!navigator.serviceWorker) {
    return 'unsupported'
  }
  return navigator.serviceWorker.scope
}

function aliasGuard() {
  const serviceWorker = navigator.serviceWorker
  if (!serviceWorker) {
    return 'unsupported'
  }
  return serviceWorker.scope
}

function ifElseGuard() {
  if (navigator.serviceWorker) {
    return navigator.serviceWorker.scope
  } else {
    return 'unsupported'
  }
}

function ternaryGuard() {
  return navigator.serviceWorker ? navigator.serviceWorker.scope : 'unsupported'
}

function andGuard() {
  return navigator.serviceWorker && navigator.serviceWorker.scope
}

function orFallback() {
  return navigator.serviceWorker || 'unsupported'
}

function nullishFallback() {
  return navigator.serviceWorker ?? 'unsupported'
}

it('should keep navigator.serviceWorker checks when service workers are unsupported', () => {
  withNavigator({}, () => {
    expect(notGuard()).toBe('unsupported')
    expect(aliasGuard()).toBe('unsupported')
    expect(ifElseGuard()).toBe('unsupported')
    expect(ternaryGuard()).toBe('unsupported')
    expect(andGuard()).toBe(undefined)
    expect(orFallback()).toBe('unsupported')
    expect(nullishFallback()).toBe('unsupported')
  })
})

it('should use navigator.serviceWorker when service workers are supported', () => {
  const serviceWorker = { scope: '/' }
  withNavigator({ serviceWorker }, () => {
    expect(notGuard()).toBe('/')
    expect(aliasGuard()).toBe('/')
    expect(ifElseGuard()).toBe('/')
    expect(ternaryGuard()).toBe('/')
    expect(andGuard()).toBe('/')
    expect(orFallback()).toBe(serviceWorker)
    expect(nullishFallback()).toBe(serviceWorker)
  })
})
