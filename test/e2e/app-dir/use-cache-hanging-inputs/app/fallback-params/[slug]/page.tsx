'use cache'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return <p>slug: {slug}</p>
}

// If generateStaticParams would be used here to define at least one set of
// complete params, we would not yield a timeout error.
