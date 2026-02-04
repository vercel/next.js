export default async function Home({
  params,
}: {
  params: Promise<{ baz_id: string }>
}) {
  const { baz_id } = await params
  return <p>baz_id/{baz_id}</p>
}
