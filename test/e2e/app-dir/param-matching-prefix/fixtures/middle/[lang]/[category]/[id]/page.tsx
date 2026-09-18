export const experimental_paramMatching = { id: 'not-found' } as const

export function generateStaticParams() {
  return [{ category: 'shoes', id: 'one' }]
}

export default function Page() {
  return <p>Must not implicitly close category</p>
}
