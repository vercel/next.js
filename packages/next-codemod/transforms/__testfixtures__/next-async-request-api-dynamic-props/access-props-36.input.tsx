export default function Page({ params }: { params: { slug: string } }) {
  Foo.useFoo()
  return <p>child {params.slug}</p>
}
