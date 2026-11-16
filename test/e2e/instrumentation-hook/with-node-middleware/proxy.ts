import { NextResponse } from 'next/server'

const instrumentationAtImport = (globalThis as any).instrumentationFinished

export function proxy() {
  return NextResponse.next({
    headers: {
      'My-Custom-Header': `instrumentationFinished=${(globalThis as any).instrumentationFinished}`,
      'Instrumentation-At-Import': instrumentationAtImport,
    },
  })
}

export const config = {
  matcher: '/',
}
