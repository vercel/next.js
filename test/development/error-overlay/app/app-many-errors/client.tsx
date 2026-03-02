'use client'

export function ClientLog({ error }: { error: Error }) {
  console.error(error)

  return null
}

export function ClientProducedError() {
  const cause = new Error('This is the cause of the client produced error')
  console.error(new Error('This is a client produced error', { cause }))

  return null
}
