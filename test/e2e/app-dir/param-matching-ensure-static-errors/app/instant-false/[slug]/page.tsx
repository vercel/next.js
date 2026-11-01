export const ensureStatic = 'navigation'
export const instant = false
export const unstable_paramMatching = { slug: 'fallback' }

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export default function Page() {
  return <p>Static content</p>
}
