export const dynamic = 'force-dynamic'

export function generateMetadata() {
  throw new Error('Metadata error')
}

export default function Page() {
  return <p>Metadata error</p>
}
