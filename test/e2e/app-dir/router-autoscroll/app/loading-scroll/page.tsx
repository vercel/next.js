import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Page(props: PageProps<'/loading-scroll'>) {
  const search = await props.searchParams
  const skipSleep = !!search.skipSleep
  if (!skipSleep) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return (
    <>
      {search.page ? <div id="current-page">{search.page}</div> : null}
      <div style={{ display: 'none' }}>Content that is hidden.</div>
      <div id="content-that-is-visible">Content which is not hidden.</div>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
      <div id="pages">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((item) => (
          <Link key={item} href={`?page=${item}&skipSleep=1`}>
            {item}
          </Link>
        ))}
      </div>
    </>
  )
}
