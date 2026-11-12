export const dynamic = 'force-dynamic'

export default function Layout({ children, slot }) {
  return (
    <>
      {children}
      {slot}
    </>
  )
}
