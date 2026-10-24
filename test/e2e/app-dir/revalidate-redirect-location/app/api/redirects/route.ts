import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { revalidateTag } from 'next/cache'

export async function POST(req: Request) {
  const body = await req.json()
  const file = path.join(process.cwd(), 'data', 'redirects.json')
  await writeFile(file, JSON.stringify(body))
  revalidateTag('redirects', 'max')
  return Response.json({ updated: true })
}
