import { Indirection } from '../indirection'

let didError = false

export default async function Page() {
  return (
    <>
      <p>
        This page errors during the prospective render during build. It errors
        on the first render during dev.
      </p>
      <Indirection>
        <ErrorFirstTime />
      </Indirection>
    </>
  )
}

async function ErrorFirstTime() {
  if (!didError) {
    didError = true
    throw new Error('BOOM (Error)')
  }
  return null
}
