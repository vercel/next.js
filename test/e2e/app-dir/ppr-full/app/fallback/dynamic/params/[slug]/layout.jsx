export default function Layout({ children }) {
  return (
    <>
      <div data-layout={Math.random().toString(16).slice(2)} />
      {children}
    </>
  )
}
