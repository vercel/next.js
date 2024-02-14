// An internal module to expose the "waitUntil" API to Edge SSR and Edge Route Handler functions.
// This is highly experimental and subject to change.

const tasks: (() => Promise<any>)[] = []

async function resolveTasksSequentially(): Promise<void> {
  let result = Promise.resolve()

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    result = result.then(() => task())
  }

  await result
  tasks.length = 0 // Clear tasks after all are executed
}

export function internal_getCurrentFunctionWaitUntil() {
  return resolveTasksSequentially()
}

export function internal_runWithWaitUntil<T>(fn: () => Promise<T>) {
  tasks.push(fn)
}
