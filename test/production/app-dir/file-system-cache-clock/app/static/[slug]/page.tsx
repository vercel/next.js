import { getData } from '../../../lib/data'

export const revalidate = 3600

// Nothing is prerendered at build time, so every entry is written at runtime.
export function generateStaticParams() {
  return []
}

export default async function Page() {
  return <p id="data">{await getData('static')}</p>
}
