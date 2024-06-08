import Link from 'next/link'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return []
}

export default async function IdPage({
  params: { id },
}: {
  params: { id: string }
}) {
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 5000))

  return (
    <div id="random-page">
      <h1>{id} page</h1>
      <Link href="/">Go Home</Link>
    </div>
  )
}
