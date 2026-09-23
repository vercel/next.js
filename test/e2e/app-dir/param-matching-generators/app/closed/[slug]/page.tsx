export const experimental_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}

export default function Page() {
  return <p id="closed-page">Allowed page</p>
}
