export const dynamic = 'force-dynamic'

export default function Layout({ children }) {
  return (
    <div>
      <p id="loading-boundary-outer-layout">Outer layout [lb-outer-layout]</p>
      {children}
    </div>
  )
}
