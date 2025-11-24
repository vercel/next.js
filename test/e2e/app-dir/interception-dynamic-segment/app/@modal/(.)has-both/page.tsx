/**
 * TEST CASE 3: Interception route WITH parallel routes AND page.tsx
 *
 * Expected: NO default.tsx needed for children slot
 * Reason: Has page.tsx which fills the children slot
 *         The @sidebar slot exists but children slot has content
 */
export default function Page() {
  return (
    <div>
      <h3>✅ TEST CASE 3: Has both @sidebar AND page.tsx</h3>
      <p>This level has @sidebar parallel route AND a page.tsx</p>
      <p>The page.tsx fills the children slot.</p>
      <p>NO default.tsx needed!</p>
    </div>
  )
}
