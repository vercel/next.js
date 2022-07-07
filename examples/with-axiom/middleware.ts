import { NextResponse, NextRequest } from 'next/server'
import { log, withAxiom } from 'next-axiom'

async function middleware(_req: NextRequest) {
  log.info("Hello from middleware", { 'bar': 'baz' })
  return NextResponse.next()
}

export default withAxiom(middleware)
