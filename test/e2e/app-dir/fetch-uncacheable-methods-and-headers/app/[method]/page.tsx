export default async function Page({
  params,
  searchParams,
}: {
  params: {
    method: string
  }
  searchParams?: {
    auth?: string
  }
}) {
  const { method } = params
  const headers = new Headers()

  if (searchParams?.auth === 'true') {
    headers.set('authorization', 'Bearer token')
  }

  const result = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers,
      method,
    }
  ).then((r) => r.text())

  return (
    <>
      <span id="result">{result}</span>
    </>
  )
}
