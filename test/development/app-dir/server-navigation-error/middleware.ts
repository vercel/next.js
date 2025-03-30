import { notFound, redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export default function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/middleware/not-found') {
    notFound()
  } else if (req.nextUrl.pathname === '/middleware/redirect') {
    redirect('/')
  }
}
