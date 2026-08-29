import { Suspense } from 'react'

async function EditProject({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <h1 id="edit-heading">Edit project {projectId}</h1>
}

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  return (
    <Suspense fallback={null}>
      <EditProject params={params} />
    </Suspense>
  )
}
