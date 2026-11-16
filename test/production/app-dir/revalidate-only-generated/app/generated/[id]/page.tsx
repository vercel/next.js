// With Cache Components the build generates `/generated/1` and a shell for
// the other paths of the route, which have no cache entry of their own.
export function generateStaticParams() {
  return [{ id: '1' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <p id="route">generated {id}</p>
}
