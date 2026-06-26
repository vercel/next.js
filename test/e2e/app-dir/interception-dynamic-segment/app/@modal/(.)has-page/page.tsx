/**
 * TEST CASE 1: Interception route WITH page.tsx
 *
 * Expected: NO default.tsx needed
 * Reason: Has a page at this level, so no children slot exists
 */
export default function Page() {
  return (
    <div>
      <h3>✅ TEST CASE 1: Has page.tsx</h3>
      <p>This interception route has a page.tsx at this level.</p>
      <p>No children slot exists, so NO default.tsx needed!</p>
    </div>
  )
}
