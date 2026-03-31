export default function StaticLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div id="static-layout">Static layout</div>
      <div>{children}</div>
    </>
  )
}
