export default async function Page() {
  if (Math.random() < 0) dynamic()
  return <p>Hello World</p>
}

function dynamic() {
  const dynamic = Math.random() + ''
  require(dynamic)
  import(dynamic)
}
