export default function Layout({
  children,
  parallel,
}: {
  children: React.ReactNode
  parallel: React.ReactNode
}) {
  return (
    <>
      {children}
      {parallel}
    </>
  )
}
