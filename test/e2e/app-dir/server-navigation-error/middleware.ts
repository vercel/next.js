import { notFound } from 'next/navigation'
import { NextRequest } from 'next/server'

export default function middleware(req: NextRequest) {
  console.log('middleware', req.url)
  if (req.url === '/middleware-not-found') {
    notFound()
  }
}
