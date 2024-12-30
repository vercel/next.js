export default function SharedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div id="has-loading-boundary">{children}</div>
}
