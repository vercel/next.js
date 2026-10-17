import { Suspense } from 'react'
import { getProjectDetails, getProjectTitle } from '@/lib/data'

export default function ProjectPage({ params }: PageProps<'/projects/[slug]'>) {
  return (
    <Suspense fallback={<h1>Loading project...</h1>}>
      <Project params={params} />
    </Suspense>
  )
}

async function Project({
  params,
}: Pick<PageProps<'/projects/[slug]'>, 'params'>) {
  const { slug } = await params
  const [title, details] = await Promise.all([
    getProjectTitle(slug),
    getProjectDetails(slug),
  ])

  return (
    <main>
      <h1>{title}</h1>
      <p>{details.description}</p>
      <h2>Recent activity</h2>
      <ul>
        {details.activity.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </main>
  )
}
