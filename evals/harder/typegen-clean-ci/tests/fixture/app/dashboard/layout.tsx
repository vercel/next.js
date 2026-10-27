export default function DashboardLayout({
  children,
}: LayoutProps<'/dashboard'>) {
  return <section aria-label="Dashboard">{children}</section>
}
