export default function PageBLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div id="page-b-layout">
      <p>Page B Layout</p>
      {children}
    </div>
  )
}
