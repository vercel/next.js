export default function Layout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      <div>test-nested layout</div>
      <div>
        <div>@sidebar slot:</div>
        {sidebar}
      </div>
      <div>
        <div>children slot:</div>
        {children}
      </div>
    </div>
  )
}
