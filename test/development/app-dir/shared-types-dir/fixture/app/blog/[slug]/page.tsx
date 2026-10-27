import { Suspense } from 'react'

async function Slug({ params }: Pick<PageProps<'/blog/[slug]'>, 'params'>) {
  const { slug } = await params
  return <p>{slug}</p>
}

export default function Page(props: PageProps<'/blog/[slug]'>) {
  // Reads the params in a Suspense boundary, so the route also builds with
  // Cache Components.
  return (
    <Suspense>
      <Slug params={props.params} />
    </Suspense>
  )
}
