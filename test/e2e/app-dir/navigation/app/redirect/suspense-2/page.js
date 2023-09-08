import { Suspense } from 'react'
import { permanentRedirect } from 'next/navigation'

function createSuspenseyComponent(Component, { timeout = 0, expire = 10 }) {
  let result
  let promise
  return function Data() {
    if (result) return result
    if (!promise)
      promise = new Promise((resolve) => {
        setTimeout(() => {
          result = <Component />
          setTimeout(() => {
            result = undefined
            promise = undefined
          }, expire)
          resolve()
        }, timeout)
      })
    throw promise
  }
}

function Redirect() {
  permanentRedirect('/redirect/result')
  return <></>
}

const SuspenseyRedirect = createSuspenseyComponent(Redirect, {
  timeout: 300,
})

export default function () {
  return (
    <div className="suspense">
      <Suspense fallback="fallback">
        <SuspenseyRedirect />
      </Suspense>
    </div>
  )
}
