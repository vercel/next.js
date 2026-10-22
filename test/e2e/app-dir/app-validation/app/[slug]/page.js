export default async function SlugPage({ params }) {
  const { slug } = await params
  return <h1>{slug}</h1>
}

// Ensures that the flight requests are always handled by the server.
export const dynamic = 'force-dynamic'
