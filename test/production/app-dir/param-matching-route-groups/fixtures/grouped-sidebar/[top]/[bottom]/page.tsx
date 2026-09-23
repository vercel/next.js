export const experimental_paramMatching = {
  top: 'blocking',
  bottom: 'fallback',
} as const

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export default function Page() {
  return <p id="main-page">Main page</p>
}
