const iterable = {
  [Symbol.iterator]() {
    ;(globalThis.__spread_iterator_events ??= []).push('array:iterator')
    return {
      next() {
        globalThis.__spread_iterator_events.push('array:next')
        return { done: true }
      },
    }
  },
}

const array = [...iterable]

export {}
