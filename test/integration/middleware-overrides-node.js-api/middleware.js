export default function middleware() {
  process.cwd = () => 'fixed-value'
  console.log(process.cwd(), !!process.env)
  return new Response()
}
