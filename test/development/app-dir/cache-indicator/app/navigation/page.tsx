import { cacheTag } from 'next/cache'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div id="navigation-page">
      Hello navigation page!
      <Suspense fallback={<div>Loading</div>}>
        <Component />
      </Suspense>
      <SlowThing />
    </div>
  )
}

async function Component() {
  const posts = await getBlogPosts()
  return (
    <div>
      {posts.map((post) => (
        <div key={post.id}>{post.content}</div>
      ))}
    </div>
  )
}

async function getBlogPosts() {
  'use cache'
  cacheTag('blog-posts')
  // sleep for 2s
  await new Promise((resolve) => setTimeout(resolve, 2000))

  return [{ id: 'foo', content: 'bar' }]
}

async function SlowThing() {
  // sleep for 2s
  await new Promise((resolve) => setTimeout(resolve, 2000))

  return <div>Slow Thing</div>
}
