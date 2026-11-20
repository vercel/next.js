export default function Layout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <div>
      {children}
      {slot}
    </div>
  )
}
