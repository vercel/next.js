import { connection } from 'next/server'
import cacheControl from '../../cache-control'

export async function GET() {
  await connection()
  return Response.json(cacheControl.read())
}

export async function POST(request: Request) {
  const command = await request.json()
  switch (command.action) {
    case 'configure':
      cacheControl.configure(command.options)
      break
    case 'register':
      cacheControl.register(command.rule)
      break
    case 'release':
      cacheControl.release(command.id)
      break
    case 'release-all':
      cacheControl.releaseAll()
      break
    default:
      return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 204 })
}
