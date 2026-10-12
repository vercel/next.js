// Closing bottom must not silently close the explicitly blocking top param.
export const unstable_paramMatching = { bottom: 'not-found' } as const

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export default function Page() {
  return <p>Inherited parameter policy</p>
}
