export function generateStaticParams() {
  return [{ slug: ['alpha'] }, { slug: ['beta'] }]
}

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return (
    <main>
      <h1>{`Slug page: ${slug.join('/')}`}</h1>
    </main>
  )
}
