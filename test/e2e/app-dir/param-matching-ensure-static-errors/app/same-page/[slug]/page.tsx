export const ensureStatic = 'navigation'
export const unstable_paramMatching = { slug: 'fallback' }

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export default function Page() {
  // Even a route that does not read params cannot currently serve
  // navigation-mode fallbacks.
  return <p>Static content</p>
}
