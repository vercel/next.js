import { Suspense } from 'react'

async function Project({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return <h1 id="project-heading">Project {projectId}</h1>
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  return (
    <Suspense fallback={null}>
      <Project params={params} />
    </Suspense>
  )
}
