import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAccessState } from '../actions'
import { RevokeAccessButton } from '../components/delete-admin-button'

async function ProtectedContent() {
  const accessState = await getAccessState()

  if (!accessState) {
    redirect('/redirect-revalidation/register')
  }

  return (
    <>
      <RevokeAccessButton />
      <p id="protected-status">AUTHORIZED</p>
      <p id="protected-access">access: {accessState}</p>
    </>
  )
}

export default function Page() {
  return (
    <>
      <h1 id="protected-page">Protected</h1>
      <Suspense fallback="loading...">
        <ProtectedContent />
      </Suspense>
    </>
  )
}
