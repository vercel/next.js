import { redirect } from 'next/navigation'

async function redirectToOtherDeployment() {
  'use server'
  redirect('/dynamic-page?deployment=2')
}

export default function ActionRedirectPage() {
  return (
    <div>
      <h1 id="action-page">Action Redirect Page</h1>
      <form action={redirectToOtherDeployment}>
        <button id="redirect-action-button" type="submit">
          Redirect via Server Action
        </button>
      </form>
    </div>
  )
}
