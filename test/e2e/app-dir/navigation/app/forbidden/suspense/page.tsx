import { Suspense } from 'react'
import { forbidden } from 'next/navigation'

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
          resolve(true)
        }, timeout)
      })
    throw promise
  }
}

function Forbidden() {
  forbidden()
  return <></>
}

const SuspenseyForbidden = createSuspenseyComponent(Forbidden, {
  timeout: 300,
})

export default function () {
  return (
    <div className="suspense">
      <Suspense fallback="fallback">
        <SuspenseyForbidden />
      </Suspense>
    </div>
  )
}
