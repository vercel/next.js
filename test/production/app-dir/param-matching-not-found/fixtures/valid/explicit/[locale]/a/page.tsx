export const unstable_paramMatching = { locale: 'not-found' } as const

export function generateStaticParams() {
  return [{ locale: 'en' }]
}

export default function Page() {
  return <p>Static page</p>
}
