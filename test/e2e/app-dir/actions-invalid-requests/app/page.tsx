import { recordSubmission } from './actions'

// The app needs at least one registered Server Action for these requests to
// reach the action handler at all -- an app with no actions bails out earlier.
export default function Page() {
  return (
    <>
      <p id="state">not-submitted</p>
      <form id="action-form" action={recordSubmission}>
        <button type="submit">Submit</button>
      </form>
    </>
  )
}
