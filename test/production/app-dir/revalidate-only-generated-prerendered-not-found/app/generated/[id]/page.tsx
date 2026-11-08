// The build generates `/generated/1`. The other paths of the route have no
// cache entry before they are requested.
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
