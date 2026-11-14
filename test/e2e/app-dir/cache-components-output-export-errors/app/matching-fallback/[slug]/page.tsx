export const unstable_paramMatching = { slug: 'fallback' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return <p>Static content</p>
}
