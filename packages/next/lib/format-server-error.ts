export function formatServerError(error: Error): void {
  if (error.message.includes('createContext is not a function')) {
    const message =
      'createContext only works in Client Components. Add "use client" at the top of your file to use createContext. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components#context'
    error.message = message
    if (error.stack) {
      const lines = error.stack.split('\n')
      lines[0] = message
      error.stack = lines.join('\n')
    }
  }
}
