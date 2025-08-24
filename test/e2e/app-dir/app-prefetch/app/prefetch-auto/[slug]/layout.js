import Link from 'next/link'

export const dynamic = 'force-dynamic'

function getData() {
  const res = new Promise((resolve) => {
    setTimeout(() => {
      resolve({ message: 'Layout Data!' })
    }, 2000)
  })
  return res
}

export default async function Layout({ children }) {
  const result = await getData()

  return (
    <div>
      <h1>Layout</h1>
      <Link prefetch={undefined} href="/prefetch-auto/justputit">
        Prefetch Link
      </Link>
      {children}
      <h3>{JSON.stringify(result)}</h3>
    </div>
  )
}
