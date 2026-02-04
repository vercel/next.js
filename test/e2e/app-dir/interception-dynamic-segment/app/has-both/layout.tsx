export default function Layout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      <div>has-both layout</div>
      <div>
        <div>@sidebar:</div>
        {sidebar}
      </div>
      <div>
        <div>children:</div>
        {children}
      </div>
    </div>
  )
}
