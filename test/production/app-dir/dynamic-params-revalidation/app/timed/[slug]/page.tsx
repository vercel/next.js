import { randomUUID } from 'node:crypto'

export const dynamicParams = false
export const revalidate = 1

export function generateStaticParams() {
  return [{ slug: 'known' }, { slug: 'stale' }]
}

export default function Page() {
  return <p id="generation">{randomUUID()}</p>
}
