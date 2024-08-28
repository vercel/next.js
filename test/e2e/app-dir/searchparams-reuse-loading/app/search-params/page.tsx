import Link from 'next/link'

export default async function Page({
  searchParams,
}: {
  searchParams: Record<string, string>
}) {
  // sleep for 500ms
  await new Promise((resolve) => setTimeout(resolve, 500))
  return (
    <>
      <h1 id="params">{JSON.stringify(searchParams)}</h1>
      <Link href="/">Back</Link>
    </>
  )
}
