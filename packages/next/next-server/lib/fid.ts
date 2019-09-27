/**
 * This is a modified version of the First Input Delay polyfill
 * https://github.com/GoogleChromeLabs/first-input-delay
 *
 * It checks for a first input before and after hydration
 */

type DelayCallback = (delay: number, event: Event) => void
type addEventListener = (
  type: string,
  listener: EventListener,
  listenerOpts: EventListenerOptions
) => void
type removeEventListener = addEventListener

const fidPolyfill = (
  addEventListener: addEventListener,
  removeEventListener: removeEventListener
) => {
  let firstInputEvent: Event
  let firstInputDelay: number
  let firstInputTimeStamp: number

  let callbacks: DelayCallback[] = []

  const listenerOpts = { passive: true, capture: true }
  const startTimeStamp = +new Date()

  const pointerup = 'pointerup'
  const pointercancel = 'pointercancel'

  function onInputDelay(callback: DelayCallback) {
    callbacks.push(callback)
    reportInputDelayIfRecordedAndValid()
  }

  function recordInputDelay(delay: number, evt: Event) {
    firstInputEvent = evt
    firstInputDelay = delay
    firstInputTimeStamp = +new Date()

    reportInputDelayIfRecordedAndValid()
  }

  function reportInputDelayIfRecordedAndValid() {
    const hydrationMeasures = performance.getEntriesByName(
      'Next.js-hydration',
      'measure'
    )
    const firstInputStart = firstInputTimeStamp - startTimeStamp

    if (
      firstInputDelay >= 0 &&
      firstInputDelay < firstInputStart &&
      (hydrationMeasures.length === 0 ||
        hydrationMeasures[0].startTime < firstInputStart)
    ) {
      callbacks.forEach(function(callback) {
        callback(firstInputDelay, firstInputEvent)
      })

      // If the app is already hydrated, that means the first "post-hydration" input
      // has been measured and listeners can be removed
      if (hydrationMeasures.length > 0) {
        eachEventType(removeEventListener)
        callbacks = []
      }
    }
  }

  function onPointerDown(delay: number, evt: Event) {
    function onPointerUp() {
      recordInputDelay(delay, evt)
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
      const isEpochTime = evt.timeStamp > 1e12
      const now = isEpochTime ? +new Date() : performance.now()

      const delay = now - evt.timeStamp

      if (evt.type == 'pointerdown') {
        onPointerDown(delay, evt)
      } else {
        recordInputDelay(delay, evt)
      }
    }
  }

  function eachEventType(callback: addEventListener | removeEventListener) {
    const eventTypes = [
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

  let context = self as any
  context['hydrationMetrics'] = context['hydrationMetrics'] || {}
  context['hydrationMetrics']['onInputDelay'] = onInputDelay
}

export default fidPolyfill
