export function GET() {
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('app:route:stale')
  }
  return new Response('app:route')
}

export const revalidate = 2
