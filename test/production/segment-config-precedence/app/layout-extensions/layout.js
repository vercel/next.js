export const runtime = 'nodejs'

export default function Layout({ children }) {
  return (
    <>
      <p id="layout">js</p>
      {children}
    </>
  )
}
