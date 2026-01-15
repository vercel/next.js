export default function Layout({
  children,
  slot1,
  slot2,
}: {
  children: React.ReactNode
  slot1: React.ReactNode
  slot2: React.ReactNode
}) {
  return (
    <div>
      <div data-testid="main">{children}</div>
      <div data-testid="slot1">{slot1}</div>
      <div data-testid="slot2">{slot2}</div>
    </div>
  )
}
