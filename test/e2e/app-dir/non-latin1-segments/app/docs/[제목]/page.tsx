// A dynamic segment whose *param name* is non-Latin-1. The param name is what
// gets encoded into the segment cache key.
export default function Page() {
  return <h1 id="unicode-param">hello from a unicode param name</h1>
}
