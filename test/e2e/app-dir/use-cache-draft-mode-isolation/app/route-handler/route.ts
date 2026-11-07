import { connection, NextRequest } from 'next/server'
import { getContent } from '../get-content'

export async function GET(request: NextRequest) {
  await connection()

  const key = new URL(request.url).searchParams.get('key') ?? 'default'
  const content = await getContent(key)

  return Response.json({ content })
}
