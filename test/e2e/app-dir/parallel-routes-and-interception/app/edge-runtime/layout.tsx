export const runtime = 'edge'

export default function Layout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <div>
      <h1>Layout</h1>
      {children}
      {slot}
    </div>
  )
}
