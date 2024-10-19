export default function Page({ params: { id } }) {
  return <p>{id}</p>
}

export function generateStaticParams() {
  return []
}
