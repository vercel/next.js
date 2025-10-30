export default function Layout({
  children,
  chart,
}: {
  children: React.ReactNode
  chart: React.ReactNode
}) {
  return (
    <div>
      {children}
      {chart}
    </div>
  )
}
