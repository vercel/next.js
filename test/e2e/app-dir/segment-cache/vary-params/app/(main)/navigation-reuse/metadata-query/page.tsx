import { connection } from 'next/server'

type SearchParams = { x?: string }

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { x } = await searchParams
  return { title: `Query title: ${x}` }
}

export default async function Page() {
  await connection()
  return <p id="server-token">{`Server token: ${Math.random()}`}</p>
}
