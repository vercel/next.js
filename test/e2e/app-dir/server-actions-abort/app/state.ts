// Shared mutable state stored on `globalThis` so the server action and the
// route handler that reads it observe the same instance, regardless of how the
// bundler splits them into separate chunks.
export type ActionState = {
  started: boolean
  aborted: boolean
  completed: boolean
}

export function getState(): ActionState {
  const g = globalThis as typeof globalThis & { __actionState?: ActionState }
  return (g.__actionState ??= {
    started: false,
    aborted: false,
    completed: false,
  })
}
