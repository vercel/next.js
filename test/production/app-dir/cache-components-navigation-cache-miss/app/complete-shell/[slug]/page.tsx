export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return <p id="slug">Complete generic shell</p>
}
