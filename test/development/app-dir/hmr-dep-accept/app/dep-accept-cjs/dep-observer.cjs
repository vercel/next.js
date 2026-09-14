let dep = require('./dep.cjs')
let currentValue = dep.value
let acceptCallCount = 0
const listeners = new Set()

if (module.hot) {
  module.hot.accept('./dep.cjs', () => {
    dep = require('./dep.cjs')
    currentValue = dep.value
    acceptCallCount++
    listeners.forEach((fn) => fn(currentValue, acceptCallCount))
  })
}

module.exports = {
  getValue() {
    return currentValue
  },
  getAcceptCallCount() {
    return acceptCallCount
  },
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
