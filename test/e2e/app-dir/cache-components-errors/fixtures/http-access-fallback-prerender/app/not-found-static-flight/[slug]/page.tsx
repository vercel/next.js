export function generateStaticParams() {
  return [{ slug: 'not-found' }]
}

export default function Page() {
  return <p>static flight</p>
}
