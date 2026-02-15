export default function DynamicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div>{children}</div>
}

export const metadata = {
  keywords: 'dynamic,items',
}
