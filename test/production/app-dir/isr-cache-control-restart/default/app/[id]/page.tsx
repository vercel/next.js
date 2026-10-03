// Rendered on demand (nothing is prerendered) and cached for an hour.
export const revalidate = 3600

export function generateStaticParams() {
  return []
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <p id="page">page {id}</p>
}
