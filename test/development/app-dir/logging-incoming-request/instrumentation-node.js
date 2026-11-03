export function register() {
  const originalWrite = process.stdout.write

  process.stdout.write = function (chunk, ...args) {
    if (
      typeof chunk === 'string' &&
      chunk.includes('GET /logging-error-redirect ')
    ) {
      process.stdout.write = originalWrite
      throw new Error('Simulated request logging failure')
    }

    return originalWrite.call(this, chunk, ...args)
  }
}
