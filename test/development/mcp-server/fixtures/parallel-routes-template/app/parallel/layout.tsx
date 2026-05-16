export default function ParallelLayout({
  children,
  sidebar,
  content,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
  content: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex' }}>
      <div style={{ flex: '0 0 200px', borderRight: '1px solid #ccc' }}>
        {sidebar}
      </div>
      <div style={{ flex: 1 }}>{content}</div>
      <div>{children}</div>
    </div>
  )
}
