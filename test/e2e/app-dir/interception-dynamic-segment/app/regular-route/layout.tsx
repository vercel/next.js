export default function Layout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      <div>Regular Route Layout</div>
      <div>{sidebar}</div>
      <div>{children}</div>
    </div>
  )
}
