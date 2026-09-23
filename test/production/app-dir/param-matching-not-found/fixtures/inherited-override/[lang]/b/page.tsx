export const unstable_paramMatching = { lang: 'blocking' } as const

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function Page() {
  return <p>Static page</p>
}
