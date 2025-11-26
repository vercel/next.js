import Link from 'next/link'
type AnySearchParams = { [key: string]: string | Array<string> | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  // sleep for 500ms
  await new Promise((resolve) => setTimeout(resolve, 500))
  return (
    <>
      <h1 id="params">{JSON.stringify(await searchParams)}</h1>
      <Link href="/with-middleware">Back</Link>
    </>
  )
}
