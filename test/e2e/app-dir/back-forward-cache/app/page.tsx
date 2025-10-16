// @ts-ignore -- the latest @types/react don't have this anymore
import { unstable_Activity as Activity } from 'react'

export default function Page() {
  return (
    <Activity mode="hidden">
      <div id="activity-content">Hello</div>
    </Activity>
  )
}
