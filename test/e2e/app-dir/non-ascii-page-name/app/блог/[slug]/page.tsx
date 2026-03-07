export function generateStaticParams() {
  return [{ slug: 'hello' }]
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>blog post: {slug}</p>
}
