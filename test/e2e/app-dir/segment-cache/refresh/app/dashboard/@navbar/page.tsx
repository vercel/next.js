import { Suspense } from 'react'
import { connection } from 'next/server'
import { RenderCounterClient } from './client'

async function DynamicRenderCounter(): Promise<React.ReactNode> {
  // Renders a count of the number of times the client receives new dynamic data
  // from the server. The count is computed on the client and stored in React
  // state, so it gets reset if the state of the tree is reset.
  await connection()
  const uuid = crypto.randomUUID()
  return <RenderCounterClient uuid={uuid} />
}

export default function DashboardNavbarLandingPage() {
  return (
    <div>
      <p>Navbar</p>
      <Suspense fallback={<div>Loading...</div>}>
        <p>
          Navbar dynamic render counter:{' '}
          <span id="navbar-dynamic-render-counter">
            <DynamicRenderCounter />
          </span>
        </p>
      </Suspense>
    </div>
  )
}
