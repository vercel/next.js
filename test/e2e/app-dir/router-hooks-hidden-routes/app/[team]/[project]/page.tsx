import { Probe } from '../../../components/probe'
import { CatchErrorBoundary, Thrower } from '../../../components/thrower'

export function generateStaticParams() {
  return [{ project: 'a' }, { project: 'b' }]
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ team: string; project: string }>
}) {
  const segmentParams = await params
  const { project } = segmentParams
  return (
    <>
      <Probe label="project-page" segmentParams={segmentParams} />
      <Thrower project={project} action="error" />
      <Thrower project={project} action="not-found" />
      <CatchErrorBoundary>
        <Thrower project={project} action="catch-error" />
      </CatchErrorBoundary>
    </>
  )
}
