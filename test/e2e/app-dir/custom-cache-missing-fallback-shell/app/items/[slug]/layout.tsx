export function generateStaticParams() {
  return [{ slug: 'a' }]
}

export default async function ItemLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <section>
      <h1>{`Item ${slug}`}</h1>
      {children}
    </section>
  )
}
