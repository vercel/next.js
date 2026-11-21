export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p id="page-route-decisions">{`Route decisions page: ${slug}`}</p>
}

export function generateStaticParams() {
  return [{ slug: 'small' }, { slug: 'large' }]
}
