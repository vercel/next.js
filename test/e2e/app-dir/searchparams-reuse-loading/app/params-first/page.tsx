import Link from 'next/link'

export default async function Home(props) {
  const searchParams = await props.searchParams
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
        <Link href="/params-first?page=2" replace>
          page 2
        </Link>
      </div>
      <div>
        <Link href="/params-first?page=3" replace>
          page 3
        </Link>
      </div>
      <div>
        <Link href="/params-first?page=4" replace>
          page 4
        </Link>
      </div>
      <div>
        <Link href="/params-first" replace>
          No Params
        </Link>
      </div>
    </div>
  )
}
