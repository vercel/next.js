export function generateStaticParams() {
  return [{ lang: 'fr' }]
}

export default function Page() {
  return <p>Static page</p>
}
