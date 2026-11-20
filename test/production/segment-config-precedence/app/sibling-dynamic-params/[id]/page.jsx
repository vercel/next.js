export const dynamicParams = false

export function generateStaticParams() {
  return [{ id: 'known' }]
}

export default async function Page({ params }) {
  const { id } = await params
  return <p id="children">{id}</p>
}
