export function generateStaticParams() {
  return [{ slug: ['foobar'] }]
}

export default function Page() {
  return <div>Root Catch-All Page</div>
}
