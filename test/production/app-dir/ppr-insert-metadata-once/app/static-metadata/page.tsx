import { Metadata } from 'next'
import { connection } from 'next/server'
// import { Suspense } from 'react'

export default function Page() {
  return (
    <div className="container">
      <SuspendedComponent />
      {/* <Suspense>
      </Suspense> */}
    </div>
  )
}

async function SuspendedComponent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return (
    <div>
      <div>suspended component</div>
      <NestedSuspendedComponent />
    </div>
  )
}

async function NestedSuspendedComponent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <div>nested suspended component</div>
}

export async function generateMetadata(): Promise<Metadata> {
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  return {
    title: `this-is-title`,
    description: `this-is-description`,
    authors: [{name: 'huozhi'}],   
  }
}
