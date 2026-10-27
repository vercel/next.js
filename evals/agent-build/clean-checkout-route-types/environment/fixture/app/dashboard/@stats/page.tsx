import { listProjects } from '@/lib/projects'

export default function StatsSlot() {
  const projects = listProjects()
  const deployments = projects.reduce(
    (total, project) => total + project.deployments,
    0
  )
  const healthy = projects.filter(
    (project) => project.status === 'healthy'
  ).length

  return (
    <dl data-slot="stats">
      <dt>Deployments</dt>
      <dd>{deployments}</dd>
      <dt>Healthy projects</dt>
      <dd>
        {healthy} of {projects.length}
      </dd>
    </dl>
  )
}
