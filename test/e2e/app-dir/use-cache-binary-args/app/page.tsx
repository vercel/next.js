async function getCached(bytes: Uint8Array) {
  'use cache'
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex}-${Math.random()}`
}

async function getCachedFile(file: File) {
  'use cache'
  return `${file.name}-${file.type}-${Math.random()}`
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const hex = (params.bytes as string) ?? ''
  const bytes = new Uint8Array(
    hex.match(/../g)?.map((pair) => parseInt(pair, 16)) ?? []
  )
  if (params.name === undefined) {
    return <p id="x">{await getCached(bytes)}</p>
  }
  return (
    <p id="f">
      {await getCachedFile(
        new File([bytes], params.name as string, {
          type: (params.type as string) ?? '',
        })
      )}
    </p>
  )
}
