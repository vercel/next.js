'use client'

export function Client({ error }) {
  if (typeof window === 'undefined') {
    // In dev, the Flight client revives the Server Component error with a
    // stack made of React's fake `about://React/...` frames.
    console.log(
      'ssr-error-log-server-error has fake frames: ' +
        error.stack.includes('about://React/')
    )
    console.error(error)
  }
  return null
}
