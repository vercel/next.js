export default async function Page({ params }: { params: Promise<{ id }> }) {
  return <p>{(await params).id}</p>
}
