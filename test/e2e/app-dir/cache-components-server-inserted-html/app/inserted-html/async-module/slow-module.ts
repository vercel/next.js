// A module that takes longer than a task to load.
await new Promise<void>((resolve) => setTimeout(resolve, 300))

export const message = 'slow module loaded'
