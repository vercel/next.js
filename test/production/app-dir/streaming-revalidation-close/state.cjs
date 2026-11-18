const stateSymbol = Symbol.for('streaming-revalidation-close')

function getState() {
  return (globalThis[stateSymbol] ??= {
    events: [],
    gates: new Map(),
    requests: [],
    entries: new Map(),
    stale: false,
  })
}

function createGate(name) {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  getState().gates.set(name, { promise, resolve })
}

function waitForGate(name) {
  return getState().gates.get(name)?.promise ?? Promise.resolve()
}

function releaseGate(name) {
  getState().gates.get(name)?.resolve()
  getState().gates.delete(name)
}

module.exports = { getState, createGate, waitForGate, releaseGate }
