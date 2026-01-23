export default function LaptopsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-laptops-layout>
      <div>Laptops Layout</div>
      {children}
    </div>
  )
}
