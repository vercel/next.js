import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Layout({ children }) {
  return (
    <div>
      <h1>Layout</h1>
      <Link
        prefetch={undefined}
        href="/prefetch-auto/rewrite?test=1"
        id="to-rewrite"
      >
        To test=1 with prefetch=undefined
      </Link>
      {children}
    </div>
  )
}
