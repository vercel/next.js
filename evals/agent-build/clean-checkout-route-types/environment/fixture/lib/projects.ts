export type Project = {
  slug: string
  name: string
  region: 'iad1' | 'fra1' | 'sfo1'
  deployments: number
  status: 'healthy' | 'degraded'
}

const projects: Project[] = [
  {
    slug: 'relay',
    name: 'Relay API',
    region: 'iad1',
    deployments: 412,
    status: 'healthy',
  },
  {
    slug: 'console',
    name: 'Relay Console',
    region: 'fra1',
    deployments: 97,
    status: 'degraded',
  },
  {
    slug: 'docs',
    name: 'Relay Docs',
    region: 'sfo1',
    deployments: 58,
    status: 'healthy',
  },
]

export function listProjects(): Project[] {
  return projects
}

export function getProject(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug)
}

export const recentActivity = [
  {
    id: 'evt_1',
    project: 'relay',
    message: 'Deployment promoted to production',
  },
  { id: 'evt_2', project: 'console', message: 'Error rate above 2% for 5 min' },
  { id: 'evt_3', project: 'docs', message: 'Preview deployment ready' },
]
