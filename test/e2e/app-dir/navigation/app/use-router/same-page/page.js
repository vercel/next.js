import { connection } from 'next/server'
import { NavigateAndTrackRouterIdentity } from '../navigate'

export default async function Page({ searchParams }) {
  // the page should be dynamic so that `router.push()` to the current path actually does a request + navigates.
  await connection()
  const { count: countStr = '0' } = await searchParams
  const count = Number.parseInt(countStr)
  return (
    <>
      {/* add a changing element to know that we actually navigated */}
      <div id="count-from-server">{count}</div>
      <NavigateAndTrackRouterIdentity
        href={
          '/use-router/same-page' +
          '?' +
          new URLSearchParams({ count: count + 1 })
        }
      />
    </>
  )
}
