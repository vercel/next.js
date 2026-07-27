/**
 * TEST CASE: Interception route WITHOUT parallel routes (just a page)
 *
 * Expected: Should work WITHOUT special null default handling
 * Reason: No parallel routes at this level means no children slot structure
 *         The page itself is the content, no implicit layout needed
 */
export default function Page() {
  return (
    <div>
      <h3>✅ Simple interception page (no parallel routes)</h3>
      <p>This is just a regular page.tsx at the interception route level.</p>
      <p>No @sidebar or other parallel routes.</p>
      <p>Should NOT need null default logic!</p>
    </div>
  )
}
