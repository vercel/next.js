export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <div>Hello {(await params).slug}</div>
}

export async function generateStaticParams() {
  // Empty at runtime but not statically analyzable, so it falls back to the
  // factory stack anchored at the declaration.
  const items: string[] = []
  return items.filter(Boolean).map((slug) => ({ slug }))
}
