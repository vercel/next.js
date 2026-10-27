import { notFound } from 'next/navigation'
import { getProject, listProjects } from '@/lib/projects'

export function generateStaticParams() {
  return listProjects().map((project) => ({ project: project.slug }))
}

export default async function ProjectPage({
  params,
}: PageProps<'/dashboard/projects/[project]'>) {
  const { project: slug } = await params
  const project = getProject(slug)

  if (!project) notFound()

  return (
    <>
      <h1>{project.name}</h1>
      <dl>
        <dt>Region</dt>
        <dd>{project.region}</dd>
        <dt>Deployments</dt>
        <dd>{project.deployments}</dd>
        <dt>Status</dt>
        <dd data-status={project.status}>{project.status}</dd>
      </dl>
    </>
  )
}
