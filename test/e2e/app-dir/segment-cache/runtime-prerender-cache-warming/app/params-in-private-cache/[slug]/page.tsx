export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  'use cache: private'
  const { slug } = await params
  return (
    <main>
      <p id="slug">{`Slug: ${slug}`}</p>
    </main>
  )
}
