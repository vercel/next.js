import { testRequestAPIs } from '../helpers'

export default async function Page() {
  return (
    <form
      action={async () => {
        'use server'
        testRequestAPIs('/request-apis/server-action')
      }}
    >
      <button type="submit">Submit</button>
    </form>
  )
}
