export function generateStaticParams() {
  return [{ id: '123' }]
}

export default function RegularPage() {
  return <div id="catchall-regular-page">Regular Page</div>
}
