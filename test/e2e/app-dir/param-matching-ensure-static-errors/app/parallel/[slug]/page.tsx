export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export default function Page() {
  return <p>Main content</p>
}
