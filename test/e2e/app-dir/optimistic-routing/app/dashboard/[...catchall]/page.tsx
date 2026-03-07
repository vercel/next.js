import { connection } from 'next/server'

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ catchall: string[] }>
}) {
  const { catchall } = await params
  await connection()
  return (
    <div id="catchall-page">
      <h1 id="catchall-title">Catch All: {catchall.join('/')}</h1>
    </div>
  )
}
