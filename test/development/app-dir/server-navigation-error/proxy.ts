import { notFound, redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/proxy/not-found') {
    notFound()
  } else if (req.nextUrl.pathname === '/proxy/redirect') {
    redirect('/')
  }
}
