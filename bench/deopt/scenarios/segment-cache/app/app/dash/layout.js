export default function DashLayout({ children, side }) {
  return (
    <div>
      <aside>{side}</aside>
      <section>{children}</section>
    </div>
  )
}
