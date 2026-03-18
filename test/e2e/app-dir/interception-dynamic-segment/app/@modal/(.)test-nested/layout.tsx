export default function Layout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      <div>{sidebar}</div>
      <div>{children}</div>
    </div>
  )
}
