export default async function ParamsSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return <p>Done {slug}</p>
}
