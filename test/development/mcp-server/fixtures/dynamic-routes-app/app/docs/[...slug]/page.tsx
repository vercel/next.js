export default function Docs({ params }: { params: { slug: string[] } }) {
  return <div>Docs: {params.slug.join('/')}</div>
}
