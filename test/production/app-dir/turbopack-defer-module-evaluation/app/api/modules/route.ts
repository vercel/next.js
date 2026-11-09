import { connection } from 'next/server'
import { declared } from '../../../lib/declared/route'
import { undeclared } from '../../../lib/undeclared/route'
import { read } from '../../../lib/use'

export async function GET(request: Request) {
  await connection()

  const use = new URL(request.url).searchParams.has('use')
  return Response.json(
    read(
      () => undeclared(),
      () => declared(),
      use
    )
  )
}
