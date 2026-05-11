export default function DynamicServerPage({ params }) {
  const slug = params.slug

  return <h1>{slug}</h1>
}
