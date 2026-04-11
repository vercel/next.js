export default async function DynamicServerPage({ params }) {
  const { slug } = await params

  return <h1>{slug}</h1>
}
