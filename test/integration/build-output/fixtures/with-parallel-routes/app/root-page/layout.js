export default function Layout({ children, header, footer }) {
  return (
    <>
      {header}
      {children}
      {footer}
    </>
  )
}
