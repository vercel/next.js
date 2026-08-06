/**
 * TEST CASE: Interception route WITH explicit layout.tsx but NO parallel routes
 *
 * This is the KEY test to determine if we need to check for:
 * - Implicit layout (from parallel routes) OR
 * - Explicit layout (layout.tsx file)
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div>Explicit layout at (.)explicit-layout</div>
      <div>
        <div>children:</div>
        {children}
      </div>
    </div>
  )
}
