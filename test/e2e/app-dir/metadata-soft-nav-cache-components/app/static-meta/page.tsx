// Static metadata on a static page. The shared layout is dynamic, so the route
// response is still partial even though the head is complete at prefetch time.
export const metadata = {
  title: 'Static Meta',
}

export default function StaticMetaPage() {
  return (
    <main>
      <p id="static-meta-content">Static meta content</p>
    </main>
  )
}
