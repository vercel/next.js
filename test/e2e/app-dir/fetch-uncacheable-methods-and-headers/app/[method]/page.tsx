export default async function Page({
  params,
  searchParams,
}: {
  params: {
    method: string
  }
  searchParams?: {
    auth?: string
    forceCache?: string
  }
}) {
  const { method } = params
  const headers = new Headers()
  let cache: RequestCache | undefined = undefined

  if (searchParams?.auth === 'true') {
    headers.set('authorization', 'Bearer token')
  }

  if (searchParams?.forceCache === 'true') {
    cache = 'force-cache'
  }

  const result = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers,
      method,
      cache,
    }
  ).then((r) => r.text())

  return (
    <>
      <span id="result">{result}</span>
    </>
  )
}
