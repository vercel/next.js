// The page reads no variant. The error under test comes from the middleware
// file, and a page that resolved a variant could fail for its own reasons and
// hide it.
export default function Page() {
  return <p id="page">page</p>
}
