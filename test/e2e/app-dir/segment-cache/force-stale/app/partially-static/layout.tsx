export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div id="partially-static-layout">Static layout content</div>
      {children}
    </div>
  )
}
