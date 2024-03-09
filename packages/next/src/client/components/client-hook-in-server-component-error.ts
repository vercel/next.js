import React from 'react'

export function errorClientApi(api: string) {
  const message = `${api} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
  throw new Error(message)
}

export function clientHookInServerComponentError(
  hookName: string
): void | never {
  if (process.env.NODE_ENV !== 'production') {
    // If useState is undefined we're in a server component
    if (!React.useState) {
      errorClientApi(hookName)
    }
  }
}
