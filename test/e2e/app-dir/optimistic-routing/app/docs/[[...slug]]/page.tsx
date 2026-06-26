import { connection } from 'next/server'
import Link from 'next/link'

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  await connection()

  const path = slug ? slug.join('/') : '(index)'

  return (
    <div id="docs-page">
      <h1 id="docs-title">Docs: {path}</h1>
      <p id="docs-path">Path: {path}</p>
      <Link href="/" id="back-link">
        Back to home
      </Link>
    </div>
  )
}
