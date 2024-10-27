export function GET() {
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('app:route:on-demand')
  }
  return new Response('app:route')
}

export const revalidate = 1000
