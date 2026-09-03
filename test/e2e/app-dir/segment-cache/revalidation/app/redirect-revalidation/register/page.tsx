import { Suspense } from 'react'
import { getAccessState } from '../actions'
import { GrantAccessButton } from '../components/create-admin-button'

async function RegisterContent() {
  const accessState = await getAccessState()

  return (
    <>
      {accessState ? (
        <>
          <p id="entry-message">
            Access was granted, but the client stayed on the entry route.
          </p>
          <p id="entry-access">access: {accessState}</p>
        </>
      ) : (
        <p id="entry-message">
          Granting access should redirect to the protected route.
        </p>
      )}
      <p id="entry-status">{accessState ? 'AUTHORIZED' : 'UNAUTHORIZED'}</p>
    </>
  )
}

export default function Page() {
  return (
    <>
      <h1 id="entry-page">Entry</h1>
      <GrantAccessButton />
      <Suspense fallback="loading...">
        <RegisterContent />
      </Suspense>
    </>
  )
}
