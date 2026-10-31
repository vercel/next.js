import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicProject() {
  await connection()
  return <h1>PROJECT PAGE</h1>
}

export default function ProjectPage() {
  return (
    <main>
      <Suspense fallback={<div id="project-loading">Loading project...</div>}>
        <DynamicProject />
      </Suspense>
    </main>
  )
}
