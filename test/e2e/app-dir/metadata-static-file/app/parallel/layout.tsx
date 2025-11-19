export default function ParallelLayout({
  children,
  parallel,
}: {
  children: React.ReactNode
  parallel: React.ReactNode
}) {
  return (
    <div>
      <p>parallel</p>
      {parallel}
      <p>children</p>
      {children}
    </div>
  )
}
