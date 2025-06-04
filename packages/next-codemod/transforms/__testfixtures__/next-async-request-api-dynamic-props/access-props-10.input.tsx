export default function Page({ params }: { params: any }) {
  function generateProps() {
    const props = { a: 1 }
    props.a = 2
    return props
  }
  return <div>hello {params.name} {generateProps().a}</div>
}
