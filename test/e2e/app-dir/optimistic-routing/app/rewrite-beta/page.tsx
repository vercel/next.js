// Fully static page - no dynamic data access
export default function RewriteBetaPage() {
  return (
    <div id="rewrite-target-page">
      <h1>Rewrite Target</h1>
      <p id="rewrite-content" data-content="beta">
        Content: beta
      </p>
    </div>
  )
}
