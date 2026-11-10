export const unstable_paramMatching = { lang: 'not-found' } as const

export function generateStaticParams() {
  return [{ lang: 'en', top: 't1' }]
}

export default function Page() {
  return <p id="composed-matcher">Composed policy</p>
}
