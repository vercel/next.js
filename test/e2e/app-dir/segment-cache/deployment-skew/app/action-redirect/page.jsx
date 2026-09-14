import { redirect } from 'next/navigation'

async function redirectToOtherDeployment() {
  'use server'
  // Route the redirect prefetch back through the test proxy so the action
  // response can come from deployment 2 instead of the current worker.
  if (process.env.TEST_PROXY_ORIGIN) {
    process.env.__NEXT_PRIVATE_ORIGIN = process.env.TEST_PROXY_ORIGIN
  }
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
