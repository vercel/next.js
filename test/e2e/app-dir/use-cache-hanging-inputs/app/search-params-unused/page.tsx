'use cache'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n: string }>
}) {
  return <p>search params not used</p>
}
