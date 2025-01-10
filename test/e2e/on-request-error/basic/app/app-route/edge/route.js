export function GET() {
  throw new Error('route-edge-error')
}

export const dynamic = 'force-dynamic'
export const runtime = 'edge'
