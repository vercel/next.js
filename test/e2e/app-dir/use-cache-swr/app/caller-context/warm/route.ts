import { connection } from 'next/server'
import { readData } from '../data'

export async function GET(request: Request) {
  await connection()
  const id = new URL(request.url).searchParams.get('id')!
  return Response.json(await readData(id))
}
