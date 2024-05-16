import Link from 'next/link'

// We want to trace this fetch in runtime
export const dynamic = 'force-dynamic'

export default async function Page({
  params: { param },
}: {
  params: { param: string }
}) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return (
    <>
      <p id="page1">app/{param}/loading/page1</p>
      <Link href={`/app/${param}/loading/page2`}>Page2</Link>
    </>
  )
}
