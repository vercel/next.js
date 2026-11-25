export default function DashboardLayout({
  children,
  analytics,
}: {
  children: React.ReactNode
  analytics: React.ReactNode
}) {
  return (
    <>
      {children}
      {analytics}
    </>
  )
}
