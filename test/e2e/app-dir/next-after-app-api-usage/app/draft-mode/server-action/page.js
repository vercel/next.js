import { testDraftMode } from '../helpers'

export default async function Page() {
  return (
    <form
      action={async () => {
        'use server'
        testDraftMode('/draft-mode/server-action')
      }}
    >
      <button type="submit">Submit</button>
    </form>
  )
}
