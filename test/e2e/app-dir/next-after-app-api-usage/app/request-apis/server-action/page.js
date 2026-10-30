import { testRequestAPIs } from '../helpers'

export default async function Page({ searchParams }) {
  const { requestId } = await searchParams
  return (
    <form
      action={async () => {
        'use server'
        testRequestAPIs('/request-apis/server-action', requestId)
      }}
    >
      <button type="submit">Submit</button>
    </form>
  )
}
