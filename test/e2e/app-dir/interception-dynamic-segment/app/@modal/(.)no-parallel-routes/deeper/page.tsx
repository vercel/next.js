/**
 * TEST CASE 2: Interception route WITHOUT parallel routes
 *
 * Expected: NO default.tsx needed at (.)no-parallel-routes level
 * Reason: No @parallel routes exist, so no implicit layout created
 *         Only has a nested page, no children slot at root level
 */
export default function Page() {
  return (
    <div>
      <h3>✅ TEST CASE 2: No parallel routes</h3>
      <p>This is a nested page under (.)no-parallel-routes/deeper</p>
      <p>No @sidebar or other parallel routes exist at parent level.</p>
      <p>NO default.tsx needed at (.)no-parallel-routes!</p>
    </div>
  )
}
