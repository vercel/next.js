export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { depEvaluatedAt } from './middleware-dep'

export default function middleware() {
  const res = NextResponse.next()
  res.headers.set('x-middleware-version', '0')
  res.headers.set('x-middleware-dep-evaluated-at', String(depEvaluatedAt))
  return res
}
