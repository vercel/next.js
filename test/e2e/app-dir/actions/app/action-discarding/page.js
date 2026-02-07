'use client'

import { slowAction, slowActionWithRevalidation } from './actions'

export default function Page() {
  return (
    <div>
      <h1>Action Discarding Test</h1>
      <button
        id="slow-action"
        onClick={async () => {
          await slowAction()
        }}
      >
        Slow Action (No Revalidation)
      </button>
      <button
        id="slow-action-revalidate"
        onClick={async () => {
          await slowActionWithRevalidation()
        }}
      >
        Slow Action (With Revalidation)
      </button>
    </div>
  )
}
