import { headers } from 'next/headers'
import { Suspense } from 'react'

type Load = (url: string) => Promise<Response>

export function Posts({ load }: { load: Load }) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PostList load={load} />
    </Suspense>
  )
}

async function PostList({ load }: { load: Load }) {
  await headers()
  const response = await load(process.env.TEST_DATA_SERVER!)
  const posts: unknown[] = await response.json()
  // A `no-store` fetch makes the rest of this component dynamic, so it can
  // read the current time.
  return (
    <p id="posts">
      {posts.length} posts at {Date.now()}
    </p>
  )
}
