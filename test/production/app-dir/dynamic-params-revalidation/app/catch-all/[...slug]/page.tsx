import { randomUUID } from 'node:crypto'

export const dynamicParams = false
export const revalidate = 3600

export function generateStaticParams() {
  return [{ slug: ['known', 'nested'] }]
}

export default function Page() {
  console.log('closed page render')
  return <p id="generation">{randomUUID()}</p>
}
