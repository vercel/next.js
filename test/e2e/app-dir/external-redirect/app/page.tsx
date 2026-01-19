import { redirect } from 'next/navigation'

export default function Page() {
  //
  return (
    <>
      <p>
        This tests a regression case where an action called outside of a React
        transition scope (onClick, in this case) results in a server-side
        redirect. Before the fix, the external redirect would get swallowed by
        Next.js.
      </p>
      <p>
        Clicking the button should redirect to localhost:9292. (The redirect
        doesn't need to actually load; the associated e2e test will intercept
        the request.)
      </p>
      <button
        id="external-redirect-from-action-on-click"
        onClick={async () => {
          'use server'
          redirect('http://localhost:9292')
        }}
      >
        External Redirect
      </button>
    </>
  )
}
