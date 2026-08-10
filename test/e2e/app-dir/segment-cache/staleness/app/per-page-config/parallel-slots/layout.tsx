export default function Layout({
  children,
  slotA,
  slotB,
}: {
  children: React.ReactNode
  slotA: React.ReactNode
  slotB: React.ReactNode
}) {
  return (
    <div>
      {children}
      {slotA}
      {slotB}
    </div>
  )
}
