'use client'

import { myAction } from './actions'

export default function Page() {
  return (
    <div>
      <button onClick={() => myAction()}>Click me</button>
    </div>
  )
}
