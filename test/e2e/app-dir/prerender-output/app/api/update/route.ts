import { writeFile } from 'node:fs/promises'
import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const redirects = await request.json()
  await writeFile('redirects.json', JSON.stringify(redirects))
  revalidateTag('redirects', 'max')
  return Response.json({ updated: true })
}
