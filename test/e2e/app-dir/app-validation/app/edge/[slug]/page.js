export const runtime = 'edge'

export default async function EdgeSlugPage({ params }) {
  const { slug } = await params
  return <h1>{slug}</h1>
}
