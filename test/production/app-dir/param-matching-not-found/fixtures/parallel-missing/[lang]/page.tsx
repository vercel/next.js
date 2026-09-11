export const experimental_paramMatching = { lang: 'not-found' } as const

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function Page() {
  return <p>Static page</p>
}
