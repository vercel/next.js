import { revalidateTag } from 'next/cache'

export function GET() {
  revalidateTag('tag', 'max')
  return Response.json('hello world')
}
