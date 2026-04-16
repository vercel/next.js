export default function ElectronicsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-electronics-layout>
      <div>Electronics Layout</div>
      {children}
    </div>
  )
}
