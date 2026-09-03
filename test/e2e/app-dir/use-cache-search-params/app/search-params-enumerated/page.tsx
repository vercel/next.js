'use cache'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = { ...(await searchParams) }

  return <p>params: {JSON.stringify(params)}</p>
}
