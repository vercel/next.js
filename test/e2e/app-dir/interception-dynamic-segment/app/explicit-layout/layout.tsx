export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div>Regular explicit-layout layout</div>
      {children}
    </div>
  )
}
