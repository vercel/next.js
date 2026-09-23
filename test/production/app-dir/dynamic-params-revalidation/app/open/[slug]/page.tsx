import { randomUUID } from 'node:crypto'

export const revalidate = 3600

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return <p id="generation">{randomUUID()}</p>
}
