import { cookies, headers, draftMode } from 'next/headers'
import { connection } from 'next/server'

export default async function Page(props: {
  params: Promise<{}>
  searchParams: Promise<{}>
}) {
  props.params.catch(logReason)
  props.searchParams.catch(logReason)
  cookies().catch(logReason)
  headers().catch(logReason)
  draftMode().catch(logReason)
  connection().catch(logReason)
  return (
    <>
      <p>
        This page renders statically but it passes all of the Request Data
        promises (cookies(), etc...) to a setTimeout scope. This test asserts
        that these promises eventually reject even when the route is entirely
        static (which this one is)
      </p>
    </>
  )
}

function logReason(reason: any) {
  console.log('Reason:', reason)
}
