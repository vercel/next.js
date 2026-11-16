export const unstable_paramMatching = { lang: 'not-found' } as const

export function generateStaticParams() {
  return [{ lang: 'en', slug: 'known' }]
}

export default function Page() {
  return <p>An unconfigured suffix stays open</p>
}
