// This page won't actually be served due to middleware rewrite
export default function AboutPage() {
  return (
    <div>
      <h1>About Page (This should not be seen)</h1>
      <p>This page should be rewritten to external server</p>
    </div>
  )
}
