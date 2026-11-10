/**
 * TEST CASE 5: Regular route (NO interception) WITH parallel routes but NO page.tsx
 *
 * Expected: REQUIRES default.tsx at regular-route level OR will 404
 * Reason: This is NOT an interception route, so missing children should 404
 *         Currently uses PARALLEL_ROUTE_DEFAULT_PATH (calls notFound())
 *         This is the CORRECT behavior for non-interception routes
 */
export default function Page() {
  return (
    <div>
      <h3>❌ TEST CASE 5: Regular route without default.tsx</h3>
      <p>This is deeper/page.tsx</p>
      <p>Parent has @sidebar but no page.tsx or default.tsx</p>
      <p>Should 404 when navigating directly to /regular-route!</p>
    </div>
  )
}
