export default async function Page() {
  return <p>Hello World</p>
}

function dynamic() {
  const dynamic = Math.random() + ''
  require(dynamic)
  import(dynamic)
}
