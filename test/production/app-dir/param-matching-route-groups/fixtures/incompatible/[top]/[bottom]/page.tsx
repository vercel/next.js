export const unstable_paramMatching = { top: 'fallback' } as const

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export default function Page() {
  return <p>Main page</p>
}
