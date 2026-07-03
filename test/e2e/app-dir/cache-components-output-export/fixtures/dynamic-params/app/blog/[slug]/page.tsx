export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

async function getPost(slug: string) {
  'use cache'
  return `post-content-for-${slug}`
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p id="post">{await getPost(slug)}</p>
}
