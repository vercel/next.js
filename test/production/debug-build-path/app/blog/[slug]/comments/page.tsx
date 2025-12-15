export default async function Comments({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <h1>Comments for: {slug}</h1>
}
