export default function Page({ params }) {
  return <div>{params.slug}</div>
}

export function generateStaticParams() {
  return []
}
