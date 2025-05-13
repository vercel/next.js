'use cache'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n: string }>
}) {
  const { n } = await searchParams

  return <p>search param: {n}</p>
}
