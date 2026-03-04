import { Suspense } from 'react'

async function PostContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="post">{slug}</p>
}

export default function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PostContent params={params} />
    </Suspense>
  )
}
