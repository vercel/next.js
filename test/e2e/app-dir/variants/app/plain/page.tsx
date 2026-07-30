// A statically prerendered route that reads no variants, so that variant routes
// can be compared against how an ordinary prerender behaves.
export default function Page() {
  return <p id="plain">plain</p>
}
