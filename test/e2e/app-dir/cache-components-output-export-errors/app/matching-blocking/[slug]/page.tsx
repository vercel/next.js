export const unstable_paramMatching = { slug: 'blocking' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return <p>Static content</p>
}
