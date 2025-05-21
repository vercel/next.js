export async function LastModified({ params }) {
  const { slug } = await params

  return (
    <p data-testid={`page-${slug}`}>
      Page /{slug} last modified: {new Date().toISOString()}
    </p>
  )
}

export async function CachedLastModified({ params }) {
  'use cache'

  return <LastModified params={params} />
}
