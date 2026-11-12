import { Probe } from '../../../components/probe'

export function generateStaticParams() {
  return [{ project: 'a' }, { project: 'b' }]
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ team: string; project: string }>
}) {
  return <Probe label="project-page" segmentParams={await params} />
}
