export default function ComputersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-computers-layout>
      <div>Computers Layout</div>
      {children}
    </div>
  )
}
