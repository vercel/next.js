import { connection } from 'next/server'

import { getContent } from '../get-content'

export default async function Page({ searchParams }: PageProps<'/page'>) {
  await connection()

  const { key = 'default' } = await searchParams
  const content = await getContent(key)

  return <p id="content">{content}</p>
}
