import { Suspense } from 'react'
import { PushButton } from './push-button'

export default function HomePage() {
  return (
    <div id="home-page">
      <h1>Home</h1>
      <Suspense>
        <PushButton />
      </Suspense>
    </div>
  )
}
