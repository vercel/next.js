const iterable = {
  [Symbol.iterator]() {
    ;(globalThis.__spread_iterator_events ??= []).push('constructor:iterator')
    return {
      next() {
        globalThis.__spread_iterator_events.push('constructor:next')
        return { done: true }
      },
    }
  },
}

new Array(...iterable)

export {}
