export default function Layout({
  children,
  intercept,
}: {
  children: React.ReactNode
  intercept: React.ReactNode
}) {
  return (
    <div>
      <div>{children}</div>
      <div>{intercept}</div>
    </div>
  )
}
