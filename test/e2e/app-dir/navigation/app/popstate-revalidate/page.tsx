import Link from 'next/link'

export default async function Home() {
  await new Promise((resolve) => setTimeout(resolve, 1500))

  return (
    <div>
      <h1>Home</h1>
      <Link href="/popstate-revalidate/foo">To /foo</Link>
    </div>
  )
}
