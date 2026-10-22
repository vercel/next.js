const iterable = {
  [Symbol.iterator]() {
    ;(globalThis.__spread_iterator_events ??= []).push('call:iterator')
    return {
      next() {
        globalThis.__spread_iterator_events.push('call:next')
        return { done: true }
      },
    }
  },
}

Math.max(...iterable)

export {}
