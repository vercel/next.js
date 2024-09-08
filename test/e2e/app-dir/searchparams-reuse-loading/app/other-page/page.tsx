import Link from 'next/link'

export default async function Home({ searchParams }) {
  return (
    <div>
      <h1>
        {searchParams.page ? (
          <>You are on page {JSON.stringify(searchParams.page)}.</>
        ) : (
          <>You are on the root page.</>
        )}
      </h1>

      <div>
        <Link href="/other-page?page=2" replace>
          page 2
        </Link>
      </div>
      <div>
        <Link href="/other-page?page=3" replace>
          page 3
        </Link>
      </div>
      <div>
        <Link href="/other-page?page=4" replace>
          page 4
        </Link>
      </div>
      <div>
        <Link href="/other-page" replace>
          No Params
        </Link>
      </div>
    </div>
  )
}
