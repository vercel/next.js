export default async function SearchPage({ searchParams }) {
  const query = await searchParams

  return <h1>{query.q}</h1>
}
