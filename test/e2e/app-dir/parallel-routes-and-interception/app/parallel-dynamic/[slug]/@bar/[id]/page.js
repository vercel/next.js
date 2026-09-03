export function generateStaticParams() {
  return [{ slug: 'foo', id: 'bar' }]
}

export default async function Page({ params }) {
  const resolvedParams = await params
  return <div id="bar">{JSON.stringify(resolvedParams)}</div>
}
