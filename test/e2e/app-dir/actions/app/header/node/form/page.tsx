'use client'

import { useActionState } from 'react'
import { getCookie, getHeader, setCookie } from '../../actions'

const getReferrer = getHeader.bind(null, 'referer')
const setTestCookie = setCookie.bind(null, 'test', '42')
const getTestCookie = getCookie.bind(null, 'test')

export default function Page() {
  const [referer, getReferrerAction] = useActionState(getReferrer, null)

  const [cookie, getTestCookieAction] = useActionState<ReturnType<
    typeof getCookie
  > | null>(getTestCookie, null)

  return (
    <>
      <form action={getReferrerAction}>
        <p id="referer">{referer ?? '<null>'}</p>
        <button id="get-referer">Get Referer</button>
      </form>
      <form action={getTestCookieAction}>
        <p id="cookie">{cookie?.value}</p>
        <button id="set-cookie" formAction={setTestCookie}>
          Set Cookie
        </button>
        <button id="get-cookie">Get Cookie</button>
      </form>
    </>
  )
}
