import { cookies } from 'next/headers'

export function POST(request) {
  const url = new URL(request.url)
  const name = url.searchParams.get('name')
  if (!name) {
    return new Response(null, { status: 400 })
  }
  cookies().set(name, '1')
  return new Response(null, { status: 204 })
}

export function DELETE(request) {
  const url = new URL(request.url)
  const name = url.searchParams.get('name')
  if (!name) {
    return new Response(null, { status: 400 })
  }
  cookies().delete(name)
  return new Response(null, { status: 204 })
}
