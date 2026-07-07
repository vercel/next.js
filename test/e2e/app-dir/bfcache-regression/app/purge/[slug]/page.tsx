const numberOfPages = 11

export function generateStaticParams() {
  return Array.from({ length: numberOfPages }, (_, i) => ({
    slug: String(i + 1),
  }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const n = Number(slug)

  return (
    <div>
      <h2 id={`purge-${n}`}>Purge {n}</h2>
      {n < numberOfPages ? (
        <a id="next" href={`/purge/${n + 1}`}>
          Next
        </a>
      ) : null}
    </div>
  )
}
