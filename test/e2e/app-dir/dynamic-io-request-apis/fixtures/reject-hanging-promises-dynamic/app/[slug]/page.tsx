import { cookies, headers, draftMode } from 'next/headers'
import { connection } from 'next/server'

export function generateStaticParams() {
  return [{ slug: 'one' }]
}

export default async function Page(props: {
  params: Promise<{}>
  searchParams: Promise<{}>
}) {
  setTimeout(async () => await props.params)
  setTimeout(async () => await props.searchParams)
  let pendingCookies = cookies()
  setTimeout(async () => await pendingCookies)
  let pendingHeaders = headers()
  setTimeout(async () => await pendingHeaders)
  let pendingDraftMode = draftMode()
  setTimeout(async () => await pendingDraftMode)
  let pendingConnection = connection()
  setTimeout(async () => await pendingConnection)
  return (
    <>
      <p>
        This page renders statically but it passes all of the Request Data
        promises (cookies(), etc...) to a setTimeout scope. This test asserts
        that these promises eventually reject even when the route is
        synchronously dynamic (which this one is by rendering a Math.random()
        value)
      </p>
      <p>
        <TriggerSyncDynamic />
      </p>
    </>
  )
}

async function TriggerSyncDynamic() {
  await new Promise((r) => process.nextTick(r))
  return Math.random()
}
