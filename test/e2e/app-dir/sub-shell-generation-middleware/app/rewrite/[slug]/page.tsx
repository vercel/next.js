export default async function RewritePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <div data-rewrite-slug={slug}>Page /rewrite/{slug}</div>
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
