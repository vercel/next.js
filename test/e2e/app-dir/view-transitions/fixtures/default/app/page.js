import Link from 'next/link'
import { unstable_ViewTransition as ViewTransition } from 'react'

export default function Page() {
  return (
    <div>
      <ViewTransition name="toggle">
        <h1>My page</h1>
      </ViewTransition>
      <ViewTransition name="link-to-title">
        <Link href="/basic">
          <h2>Go to Basic</h2>
        </Link>
      </ViewTransition>
    </div>
  )
}
