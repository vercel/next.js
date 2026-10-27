import { getProject } from '@/lib/projects'

export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/projects/[project]'>
) {
  const { project: slug } = await params
  const project = getProject(slug)

  if (!project) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  return Response.json(project)
}
