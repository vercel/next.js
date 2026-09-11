export const experimental_paramMatching = { id: 'fallback' } as const

export function generateStaticParams() {
  return [{ id: 'one' }]
}

export default function Page() {
  return <p>Static page</p>
}
