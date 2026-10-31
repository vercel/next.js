export default function Index() {
  if (typeof window !== 'undefined' && !window.initialHref) {
    window.initialHref = window.location.href
  }

  return <p id="index">Index Page</p>
}
