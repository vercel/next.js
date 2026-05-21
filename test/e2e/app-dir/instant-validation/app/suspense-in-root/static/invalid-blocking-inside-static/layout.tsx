export const unstable_instant = { level: 'experimental-error' }

export default function StaticLayout({ children }) {
  return (
    <div>
      <p>The layout does not wrap children with Suspense.</p>
      <hr />
      {children}
    </div>
  )
}
