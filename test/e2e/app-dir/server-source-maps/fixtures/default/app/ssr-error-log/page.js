'use client'

function logError() {
  const error = new Error('ssr-error-log')
  console.error(error)
}

export default function Page() {
  logError()
  return null
}
