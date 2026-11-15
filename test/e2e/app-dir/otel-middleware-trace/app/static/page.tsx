// No dynamic APIs: prerendered at build, and served from the cache.
export default function Page() {
  return <p id="marker">static page</p>
}
