import { ClientLog, ClientProducedError } from './client'

export default function ManyErrorsPage() {
  const cause = new Error('This is the cause of the server produced error')
  console.error(cause)
  const error = new Error('This is a server produced error', { cause })
  console.error(error)

  return (
    <>
      <ClientLog error={cause} />
      <ClientLog error={error} />
      <ClientProducedError />
      <ClientProducedError />
    </>
  )
}
