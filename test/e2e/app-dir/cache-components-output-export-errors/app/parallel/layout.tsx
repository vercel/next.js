export default function Layout({
  children,
  other,
}: {
  children: React.ReactNode
  other: React.ReactNode
}) {
  return (
    <>
      {children}
      {other}
    </>
  )
}
