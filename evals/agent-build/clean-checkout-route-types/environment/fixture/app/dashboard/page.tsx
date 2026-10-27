import Link from 'next/link'
import { listProjects } from '@/lib/projects'

export default function DashboardPage() {
  const projects = listProjects()

  return (
    <>
      <h1>Projects</h1>
      <ul>
        {projects.map((project) => (
          <li key={project.slug}>
            <Link href={`/dashboard/projects/${project.slug}`}>
              {project.name}
            </Link>{' '}
            · {project.status}
          </li>
        ))}
      </ul>
    </>
  )
}
