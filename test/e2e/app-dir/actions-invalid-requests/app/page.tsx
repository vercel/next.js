import { cookies } from 'next/headers'
import { recordSubmission } from './actions'

// The app needs at least one registered Server Action for these requests to
// reach the action handler at all -- an app with no actions bails out earlier.
export default async function Page() {
  const cookieStore = await cookies()
  const submitted = cookieStore.get('submitted')?.value ?? 'no'

  return (
    <>
      <p id="submitted">{submitted}</p>
      <form id="mpa-form" action={recordSubmission}>
        <button type="submit">Submit</button>
      </form>
    </>
  )
}
