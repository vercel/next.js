import { NextResponse } from 'next/server'
import { collectResult } from './collect-result'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

export async function proxy(request) {
  if (request.nextUrl.pathname === '/proxy') {
    return Response.json(await collectResult(getList), { status: 200 })
  }

  return NextResponse.next()
}
