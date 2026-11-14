import Link from 'next/link'

export async function DialogContent({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const search = tab ? `?tab=${tab}` : ''

  return (
    <div>
      <p id="dialog">dialog tab={tab ?? ''}</p>
      <Link href={`${basePath}${search}`} id="close-dialog">
        Back to {`${basePath}${search}`}
      </Link>
    </div>
  )
}
