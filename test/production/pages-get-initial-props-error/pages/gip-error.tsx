import type { GetServerSideProps } from 'next'

class IntentionalServerError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 500) {
    super(message)
    this.name = 'IntentionalServerError'
    this.statusCode = statusCode
  }
}

export default function ErrorDemo() {
  return <h1>Custom Error Page Demo</h1>
}

export const getServerSideProps: GetServerSideProps = async () => {
  throw new IntentionalServerError(
    'Intentional error triggered via getServerSideProps.'
  )
}
