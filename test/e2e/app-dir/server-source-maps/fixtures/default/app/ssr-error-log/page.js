'use client'

function logError() {
  const error = new Error('Boom')
  console.error(error)
}

export default function Page() {
  logError()
  return null
}
