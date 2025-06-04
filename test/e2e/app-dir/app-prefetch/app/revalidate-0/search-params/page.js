import Link from 'next/link'

export default async function Home({ searchParams }) {
  return (
    <>
      <div id="search-params-data">{JSON.stringify(await searchParams)}</div>
      <Link href="?foo=true">Add search params</Link>
      <Link href="/revalidate-0/search-params">Clear Params</Link>
    </>
  )
}
