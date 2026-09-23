export const experimental_paramMatching = { category: 'not-found' } as const

export function generateStaticParams() {
  return [{ category: 'shoes' }]
}

export default function Page() {
  return <p>Must not implicitly close lang</p>
}
