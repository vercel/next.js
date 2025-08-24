export default function Page() {
  throw new Error('server-page-edge-error')
}

export const dynamic = 'force-dynamic'
export const runtime = 'edge'
