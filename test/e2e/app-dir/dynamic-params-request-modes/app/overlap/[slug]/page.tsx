export const dynamicParams = false

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return <p id="specific">Specific route</p>
}
