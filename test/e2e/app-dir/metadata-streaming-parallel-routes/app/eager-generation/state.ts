type EagerGenerationState = {
  started: Set<string>
  waiters: Map<string, Array<() => void>>
}

const stateKey = Symbol.for('next.metadata.eager-generation')
const globalWithState = globalThis as typeof globalThis & {
  [stateKey]?: EagerGenerationState
}

function getState(): EagerGenerationState {
  return (globalWithState[stateKey] ||= {
    started: new Set(),
    waiters: new Map(),
  })
}

export function markGeneratorStarted(name: string) {
  const state = getState()
  state.started.add(name)
  const waiters = state.waiters.get(name)
  if (waiters) {
    state.waiters.delete(name)
    for (const resolve of waiters) {
      resolve()
    }
  }
}

export function waitForGenerator(name: string): Promise<void> {
  const state = getState()
  if (state.started.has(name)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const waiters = state.waiters.get(name)
    if (waiters) {
      waiters.push(resolve)
    } else {
      state.waiters.set(name, [resolve])
    }
  })
}
