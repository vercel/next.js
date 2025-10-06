export function GET() {
  if (Math.random() < 0) dynamic()
  return new Response('Hello World')
}

function dynamic() {
  const dynamic = Math.random() + ''
  require(dynamic)
  import(dynamic)
}
