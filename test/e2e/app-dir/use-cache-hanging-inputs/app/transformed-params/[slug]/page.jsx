async function LastModified({ params }) {
  'use cache'

  const { slug } = await params

  return (
    <p data-testid={`page-${slug}`}>
      Page /{slug} last modified: {new Date().toISOString()}
    </p>
  )
}

async function transformParams(params) {
  const { slug } = await params

  return { slug }
}

export default async function Page({ params }) {
  return <LastModified params={transformParams(params)} />
}

// Explicitly not defining `generateStaticParams` here. Otherwise, no timeout
// error would be triggered.
