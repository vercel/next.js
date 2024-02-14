// An internal module to expose the "waitUntil" API to Edge SSR and Edge Route Handler functions.
// This is highly experimental and subject to change.

const tasks: (() => Promise<any>)[] = []

async function resolveTasksSequentially(): Promise<void> {
  let result = Promise.resolve()

  function handleNext() {
    if (tasks.length) {
      const task = tasks.shift()
      result = result.then(() => {
        handleNext()
        return task?.()
      })
    }
  }

  handleNext()

  return result
}

export function internal_getCurrentFunctionWaitUntil() {
  return resolveTasksSequentially()
}

export function internal_runWithWaitUntil<T>(fn: () => Promise<T>) {
  tasks.push(fn)
}
