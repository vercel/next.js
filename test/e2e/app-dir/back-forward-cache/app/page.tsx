'use client'

// TODO: "use client" is required in this module because Activity is not
// exported from the server entrypoint of React

import { unstable_Activity as Activity } from 'react'

export default function Page() {
  return (
    <Activity mode="hidden">
      <div id="activity-content">Hello</div>
    </Activity>
  )
}
