export const unstable_paramMatching = { slug: 'fallback' } as const

export function generateStaticParams() {
  return [{ lang: 'en', slug: 'example' }]
}

export default function Page() {
  return <p>Static page</p>
}
