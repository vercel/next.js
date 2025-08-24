import Link from 'next/link'

export default async function Page({ searchParams }) {
  return (
    <>
      <h1 id="result">{JSON.stringify(await searchParams)}</h1>
      <div>
        <Link href="/navigation/searchparams?a=a">To A</Link>
      </div>
      <div>
        <Link href="/navigation/searchparams?b=b">To B</Link>
      </div>
      <div>
        <Link href="/navigation/searchparams?a=a&b=b">To A&B</Link>
      </div>
    </>
  )
}
