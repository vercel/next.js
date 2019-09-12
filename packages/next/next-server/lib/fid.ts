/**
 * This is a modified version of the First Input Delay polyfill
 * https://github.com/GoogleChromeLabs/first-input-delay
 *
 * It checks for a first input before and after hydration
 */

type DelayCallback = (delay: number, event: Event) => void

const fidPolyfill = (
  addEventListener: EventListener,
  removeEventListener: EventListener
) => {
  let firstInputEvent: Event
  let firstInputDelay: number
  let firstInputTimeStamp: Date

  let callbacks: DelayCallback[] = []

  const listenerOpts = { passive: true, capture: true }
  const startTimeStamp = new Date()

  const pointerup = 'pointerup'
  const pointercancel = 'pointercancel'

  function onFirstInputDelay(callback: DelayCallback) {
    callbacks.push(callback)
    reportFirstInputDelayIfRecordedAndValid()
  }

  function recordFirstInputDelay(delay: number, evt: Event) {
    firstInputEvent = evt
    firstInputDelay = delay
    firstInputTimeStamp = new Date()

    reportFirstInputDelayIfRecordedAndValid()
  }

  function reportFirstInputDelayIfRecordedAndValid() {
    if (
      firstInputDelay >= 0 &&
      firstInputDelay < firstInputTimeStamp - startTimeStamp
    ) {
      callbacks.forEach(function(callback) {
        callback(firstInputDelay, firstInputEvent)
      })

      // If the app is already hydrated, that means the first "post-hydration" input
      // has been measured and listeners can be removed
      if (
        performance.getEntriesByName('Next.js-hydration', 'measure').length > 0
      ) {
        eachEventType(removeEventListener)
        callbacks = []
      }
    }
  }

  function onPointerDown(delay: number, evt: Event) {
    function onPointerUp() {
      recordFirstInputDelay(delay, evt)
    }

    function onPointerCancel() {
      removePointerEventListeners()
    }

    function removePointerEventListeners() {
      removeEventListener(pointerup, onPointerUp, listenerOpts)
      removeEventListener(pointercancel, onPointerCancel, listenerOpts)
    }

    addEventListener(pointerup, onPointerUp, listenerOpts)
    addEventListener(pointercancel, onPointerCancel, listenerOpts)
  }

  function onInput(evt: Event) {
    if (evt.cancelable) {
      var isEpochTime = evt.timeStamp > 1e12
      var now = isEpochTime ? new Date() : performance.now()

      var delay = now - evt.timeStamp

      if (evt.type == 'pointerdown') {
        onPointerDown(delay, evt)
      } else {
        recordFirstInputDelay(delay, evt)
      }
    }
  }

  function eachEventType(callback: EventListener) {
    var eventTypes = [
      'click',
      'mousedown',
      'keydown',
      'touchstart',
      'pointerdown',
    ]
    eventTypes.forEach(function(eventType) {
      callback(eventType, onInput, listenerOpts)
    })
  }

  eachEventType(addEventListener)

  self['perfMetrics'] = self['perfMetrics'] || {}
  self['perfMetrics']['onFirstInputDelay'] = onFirstInputDelay
}

export default fidPolyfill
