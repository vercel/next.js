export function formatServerError(error: Error): void {
  if (error.message.includes('createContext is not a function')) {
    const message =
      'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
    error.message = message
    if (error.stack) {
      const lines = error.stack.split('\n')
      lines[0] = message
      error.stack = lines.join('\n')
    }
  }
}
