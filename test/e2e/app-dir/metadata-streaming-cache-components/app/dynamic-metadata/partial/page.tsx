import { connection } from 'next/server'

export default function Page() {
  return (
    <div className="container">
      <SuspendedComponent />
    </div>
  )
}

async function SuspendedComponent() {
  await connection()
  return (
    <div>
      <div>suspended component</div>
      <NestedSuspendedComponent />
    </div>
  )
}

async function NestedSuspendedComponent() {
  await connection()
  return <div>nested suspended component</div>
}

export async function generateMetadata() {
  await connection()
  return {
    title: 'dynamic-metadata - partial',
    description: `dynamic metadata - ${Math.random()}`,
  }
}
