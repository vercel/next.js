export function generateStaticParams() {
  return [{ id: '0' }, { id: '1' }]
}

export default async function Page({ params }) {
  const { id } = await params
  return <p id={`photo-page-${id}`}>Photo PAGE {id}</p>
}
