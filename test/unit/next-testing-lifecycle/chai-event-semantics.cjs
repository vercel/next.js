module.exports = function observeEventSemantics(chai) {
  const events = chai.util.events
  const seen = []
  const once = function (event) {
    seen.push(['once', event.type, this === events])
  }
  const object = {
    handleEvent(event) {
      seen.push(['object', event.type, this === object])
    },
  }
  const controller = new AbortController()
  const aborted = () => seen.push(['aborted'])
  events.addEventListener('custom', once, { once: true })
  events.addEventListener('custom', once, { once: true })
  events.addEventListener('custom', object)
  events.addEventListener('custom', aborted, { signal: controller.signal })
  controller.abort()
  events.dispatchEvent(new Event('custom'))
  events.dispatchEvent(new Event('custom'))
  events.removeEventListener('custom', object)
  events.dispatchEvent(new Event('custom'))
  const capture = function () {
    seen.push(['capture', this === events])
  }
  events.addEventListener('capture', capture, { capture: false })
  events.addEventListener('capture', capture, { capture: true })
  events.addEventListener('capture', capture, { capture: true })
  events.dispatchEvent(new Event('capture'))
  events.removeEventListener('capture', capture, { capture: false })
  events.dispatchEvent(new Event('capture'))
  events.removeEventListener('capture', capture, { capture: true })
  events.dispatchEvent(new Event('capture'))
  const cancelling = function (event) {
    seen.push([
      'cancel',
      event.target === events,
      event.currentTarget === events,
      this === events,
    ])
    event.preventDefault()
  }
  events.addEventListener('cancel', cancelling)
  const cancel = new Event('cancel', { cancelable: true })
  const dispatchResult = events.dispatchEvent(cancel)
  events.removeEventListener('cancel', cancelling)
  const outer = function () {
    return this
  }
  const inner = function () {
    return this
  }
  const listener = function (event) {
    if (!event.name.startsWith('events08Reentrant')) return
    seen.push([
      'registration',
      event.name,
      event.fn === (event.name.endsWith('Outer') ? outer : inner),
      event.target === events,
      this === events,
    ])
    if (event.name.endsWith('Outer'))
      chai.Assertion.addMethod('events08ReentrantInner', inner)
  }
  events.addEventListener('addMethod', listener)
  try {
    chai.Assertion.addMethod('events08ReentrantOuter', outer)
  } finally {
    events.removeEventListener('addMethod', listener)
  }
  const direct = function (event) {
    seen.push(['direct', this === events, event.target === events])
  }
  EventTarget.prototype.addEventListener.call(events, 'direct', direct, {
    capture: true,
  })
  EventTarget.prototype.dispatchEvent.call(events, new Event('direct'))
  EventTarget.prototype.removeEventListener.call(events, 'direct', direct, {
    capture: true,
  })
  EventTarget.prototype.dispatchEvent.call(events, new Event('direct'))
  const coercion = []
  const type = {
    toString() {
      coercion.push('type')
      return 'coerced'
    },
  }
  const options = {
    get once() {
      coercion.push('once')
      return false
    },
    get capture() {
      coercion.push('capture')
      return true
    },
    get passive() {
      coercion.push('passive')
      return false
    },
    get signal() {
      coercion.push('signal')
      return undefined
    },
  }
  const coerced = function () {
    seen.push(['coerced', this === events])
  }
  events.addEventListener(type, coerced, options)
  const coercionAfterAdd = [...coercion]
  type.toString = function () {
    throw new Error('event type must not be coerced again by file cleanup')
  }
  events.dispatchEvent(new Event('coerced'))
  events.removeEventListener('coerced', coerced, { capture: true })
  return {
    coercionAfterAdd,
    nativeTarget: events instanceof EventTarget,
    nativePrototype: Object.getPrototypeOf(events) === EventTarget.prototype,
    stable: events === chai.util.events,
    dispatchResult,
    defaultPrevented: cancel.defaultPrevented,
    seen,
  }
}
module.exports.methodShapes = function methodShapes(events) {
  function descriptor(value) {
    if (!value) return null
    return {
      valueType: typeof value.value,
      writable: value.writable,
      enumerable: value.enumerable,
      configurable: value.configurable,
    }
  }
  const methods = {}
  for (const key of [
    'addEventListener',
    'removeEventListener',
    'dispatchEvent',
  ]) {
    methods[key] = {
      name: events[key].name,
      length: events[key].length,
      own: descriptor(Object.getOwnPropertyDescriptor(events, key)),
      prototype: descriptor(
        Object.getOwnPropertyDescriptor(EventTarget.prototype, key)
      ),
    }
  }
  const missing = []
  for (const [key, args] of [
    ['addEventListener', []],
    ['addEventListener', ['x']],
    ['removeEventListener', []],
    ['removeEventListener', ['x']],
    ['dispatchEvent', []],
  ]) {
    try {
      events[key](...args)
      missing.push({ key, args, threw: false })
    } catch (error) {
      missing.push({
        key,
        args,
        threw: true,
        name: error.name,
        message: error.message,
        code: error.code ?? null,
      })
    }
  }
  return { methods, missing }
}
