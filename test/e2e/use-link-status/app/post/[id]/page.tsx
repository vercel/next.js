// This component delays rendering to simulate a slow page load
async function PostContent({ id }: { id: string }) {
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return (
    <div>
      <h1>Post {id}</h1>
      <p>This is post {id}</p>
      <p>Posted on: {Date.now()}</p>
    </div>
  )
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div data-testid={`post-${id}-page`}>
      <PostContent id={id} />
    </div>
  )
}
