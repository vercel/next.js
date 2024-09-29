export default async function Page(props0: { params: Promise<any> }) {
  const params = await props0.params;
  function generateProps() {
    const props = { a: 1 }
    props.a = 2
    return props
  }
  return <div>hello {params.name} {generateProps().a}</div>
}
