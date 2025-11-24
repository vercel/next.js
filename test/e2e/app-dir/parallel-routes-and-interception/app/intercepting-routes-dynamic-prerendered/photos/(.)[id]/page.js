export default async function Page({ params }) {
  const { id } = await params
  return <p id={`photo-intercepted-${id}`}>Photo INTERCEPTED {id}</p>
}

export function generateStaticParams() {
  return Array.from({ length: 3 }).map((_, i) => ({
    id: i.toString(),
  }))
}
