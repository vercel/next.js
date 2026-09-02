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
      <div>outer suspended component</div>
      <NestedSuspendedComponent />
    </div>
  )
}

async function NestedSuspendedComponent() {
  await connection()
  return <div>nested suspended component</div>
}

export const metadata = {
  title: 'dynamic-page - partial',
}
