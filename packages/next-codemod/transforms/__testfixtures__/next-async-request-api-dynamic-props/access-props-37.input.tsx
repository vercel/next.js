export default function Page({ params }: { params: { slug: string } }) {
  foo.useFakeTimers()
  return <p>child {params.slug}</p>
}
