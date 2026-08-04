export default function InnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div id="inner-layout">
      <h3>Inner layout</h3>
      {children}
    </div>
  )
}
