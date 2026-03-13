export default function PagesRoutePage() {
  return (
    <main>
      <a href="/app-route">Go to App Router</a>
      <PagesRouteMarker />
    </main>
  )
}

function PagesRouteMarker() {
  return <p id="pages-ready">pages ready</p>
}
