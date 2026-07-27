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
        <Link href="/root-page-first" replace>
          No Params
        </Link>
      </div>
      <div>
        <Link href="/root-page-first?page=2" replace>
          page 2
        </Link>
      </div>
    </div>
  )
}
