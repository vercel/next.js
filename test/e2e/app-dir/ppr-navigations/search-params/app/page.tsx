import Link from 'next/link'

type AnySearchParams = { [key: string]: string | Array<string> | undefined }

export default async function Page(props: {
  searchParams: Promise<AnySearchParams>
}) {
  const searchParams = await props.searchParams
  const hasParams = Object.keys(searchParams).length > 0
  return (
    <>
      <Link href="/?blazing=good">Go</Link>
      {hasParams ? (
        <div id="search-params">
          Search params: {JSON.stringify(await searchParams)}
        </div>
      ) : null}
    </>
  )
}
