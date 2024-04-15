import Link from 'next/link'

export default async function Page({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const hasParams = Object.keys(searchParams).length > 0
  return (
    <>
      <Link href="/?blazing=good">Go</Link>
      {hasParams ? (
        <div id="search-params">
          Search params: {JSON.stringify(searchParams)}
        </div>
      ) : null}
    </>
  )
}
