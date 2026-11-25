export async function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  'use cache'
  const { slug } = await params
  return (
    <main>
      <h1>Cached page with params</h1>
      <p id="slug">{`Slug: ${slug}`}</p>
    </main>
  )
}
