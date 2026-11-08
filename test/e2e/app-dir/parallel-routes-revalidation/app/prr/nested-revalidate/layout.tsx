export const dynamic = 'force-dynamic'

export default function Layout({
  children,
  modal,
  drawer,
}: {
  children: React.ReactNode
  modal: React.ReactNode
  drawer: React.ReactNode
}) {
  return (
    <div>
      <div>{children}</div>
      <div>{modal}</div>
      <div>{drawer}</div>
    </div>
  )
}
