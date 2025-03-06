import { unstable_ViewTransition as ViewTransition } from 'react'
import { Toggle } from './Toggle'

export default function BasicPage() {
  return (
    <div>
      <ViewTransition name="toggle">
        <Toggle />
      </ViewTransition>
      <div>
        <ViewTransition name="link-to-title">
          <h1>To Title</h1>
        </ViewTransition>
      </div>
    </div>
  )
}
