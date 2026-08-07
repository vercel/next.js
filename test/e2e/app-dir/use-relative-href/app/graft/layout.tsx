export default function GraftLayout({
  children,
  side,
}: {
  children: React.ReactNode
  side: React.ReactNode
}) {
  return (
    <div>
      <div id="graft-children">{children}</div>
      <div id="graft-side">{side}</div>
    </div>
  )
}
