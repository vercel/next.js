import { connection } from 'next/server'

/// Page is suspended and being caught by the layout Suspense boundary
export default function Page() {
  return (
    <div className="container">
      <SuspendedComponent />
    </div>
  )
}

async function SuspendedComponent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return (
    <div>
      <div>outer suspended component</div>
      <NestedSuspendedComponent />
    </div>
  )
}

async function NestedSuspendedComponent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <div>nested suspended component</div>
}

export async function generateMetadata() {
  // Slow but static metadata
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  return {
    title: 'dynamic-page - partial',
  }
}
