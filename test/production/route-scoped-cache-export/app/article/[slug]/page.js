export function generateStaticParams() {
  return ['known', 'index', 'café', 'with space'].map((slug) => ({ slug }))
}
export default async function Page({ params }) {
  return <p id="state">{`app:${decodeURIComponent((await params).slug)}`}</p>
}
