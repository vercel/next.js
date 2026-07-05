import { connection } from 'next/server'
import Link from 'next/link'

export default async function FilesPage({
  params,
}: {
  params: Promise<{ path: string[] }>
}) {
  const { path } = await params
  await connection()

  const filePath = path.join('/')

  return (
    <div id="files-page">
      <h1 id="files-title">File: {filePath}</h1>
      <p id="files-path">Path: {filePath}</p>
      <Link href="/" id="back-link">
        Back to home
      </Link>
    </div>
  )
}
