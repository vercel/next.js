import { cookies } from 'next/headers'

export async function GET() {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // don't error during build
    cookies()
  } else {
    throw new Error('this is a runtime error')
  }
}
