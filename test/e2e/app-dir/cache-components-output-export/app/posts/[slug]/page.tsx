import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

async function Post({ params }: { params: Promise<{ slug: string }> }) {
  return <p id="post">{`Post: ${(await params).slug}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>Loading post...</p>}>
      <Post params={params} />
    </Suspense>
  )
}
