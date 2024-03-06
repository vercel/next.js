export function GET() {
  return new Response('Hello World')
}

function dynamic() {
  const dynamic = Math.random() + ''
  require(dynamic)
  import(dynamic)
}
