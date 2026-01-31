export default function Layout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      {children}
      {sidebar}
    </div>
  )
}
