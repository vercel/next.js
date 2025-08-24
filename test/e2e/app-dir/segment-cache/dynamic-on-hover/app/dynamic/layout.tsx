export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      Static content in layout of dynamic page
      <div>{children}</div>
    </div>
  )
}
