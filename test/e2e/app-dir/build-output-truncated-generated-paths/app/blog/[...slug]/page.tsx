const slugs = Array.from({ length: 12 }, (_, index) => `post-${index + 1}`)

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug: [slug] }))
}

async function getPost(slug: string) {
  'use cache'
  return `content for ${slug}`
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const content = await getPost(slug.join('/'))

  return <p id="content">{content}</p>
}
