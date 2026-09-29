import { testDraftMode } from '../helpers'

export default async function Page({ searchParams }) {
  const { requestId } = await searchParams
  return (
    <form
      action={async () => {
        'use server'
        testDraftMode('/draft-mode/server-action', requestId)
      }}
    >
      <button type="submit">Submit</button>
    </form>
  )
}
