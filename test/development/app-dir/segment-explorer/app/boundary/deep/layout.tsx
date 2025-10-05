export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h2>Boundary Layout - /deep</h2>
      {children}
    </div>
  )
}
