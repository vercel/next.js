// A route group layout with no page inside the group. It is deleted by the
// test while the dev server is stopped.
export default function GroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div id="group-layout">{children}</div>
}
