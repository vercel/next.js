import { cookies } from 'next/headers'
import { testApiInPromisePassedToAfter, REQUEST_API_NAMES } from '../common'
import { Suspense } from 'react'

const COOKIE = 'api-name'

async function action(apiName: string) {
  'use server'
  const cookieStore = await cookies()
  // The page only runs the test when the cookie is set,
  // so it won't run it on initial load, only when
  // we're rerendering after an action.
  cookieStore.set(COOKIE, apiName)
}

export default async function Page() {
  return (
    <main>
      <Suspense>
        <TestAfterIfCookieSet />
      </Suspense>
      {REQUEST_API_NAMES.map((apiName) => (
        <form data-api-name={apiName} action={action.bind(null, apiName)}>
          <button type="submit">Submit - {apiName}</button>
        </form>
      ))}
    </main>
  )
}

async function TestAfterIfCookieSet() {
  const cookieStore = await cookies()
  const apiName = cookieStore.get(COOKIE)?.value
  if (apiName !== undefined) {
    testApiInPromisePassedToAfter('render after action', apiName)
  }
  return null
}
